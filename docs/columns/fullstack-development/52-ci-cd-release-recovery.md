---
title: "第 52 章：CI/CD、发布与故障恢复"
description: "把类型、构建、数据库测试与契约变成门禁，设计不可变发布、兼容迁移、最小权限和可演练的回滚恢复。"
date: '2026-10-23'
category: 部署运维
tags: [CI/CD, GitHub Actions, 发布, 恢复]
series:
  order: 53
---

# 第 52 章：CI/CD、发布与故障恢复

CI 回答“这个版本是否满足已定义的质量门禁”，CD 回答“这个通过门禁的产物如何进入指定环境”。生产故障恢复还要回答“旧应用是否兼容新数据库、丢失数据能否找回”。把三件事塞进一个自动发布脚本，常常使一个错误测试或恶意 PR 同时获得生产权限。

## 52.1 从发布契约开始

每次发布记录源码版本、锁文件、构建工具版本、镜像摘要、前端产物摘要、迁移版本与配置版本。构建一次，在后续阶段推广同一不可变产物；不能测试镜像 A 后在部署时重新安装依赖并构建出 B，再说“已测试过”。

质量门禁至少包含类型检查、格式与静态检查、独立密码原语、真实数据库业务测试和生产构建。数据库测试需要从空库迁移，升级测试还需旧版本数据 fixture。OpenAPI 变化进行语义兼容审查，浏览器主路径测试经过实际代理；依赖与镜像扫描发现风险后明确处置，不机械宣称“零漏洞”。

PR 流水线不需要生产数据库、对象存储或发布 token。来自 fork 的代码和依赖安装脚本都不可信，不在有秘密的 `pull_request_target` 上签出并执行任意 PR 代码。最小权限是默认 `contents: read`，每个需要写入的发布 job 再单独申请范围。[GitHub 安全加固](https://docs.github.com/en/actions/security-for-github-actions/security-guides/security-hardening-for-github-actions)

## 52.2 独立博客项目的验证工作流

下例放在读者独立博客仓库，不是修改教程站点发布配置的指令。官方 Action README 在核验日使用 checkout v7 与 setup-node v7；学习示例展示主版本标签，实际发布应从官方对应标签解析完整 commit SHA 固定，并按受审查流程升级。Action 自身运行时与应用选择的 Node 版本是两个配置，不能相互替代。

仓库变量 `COURSE_POSTGRES_IMAGE` 必须设置为第 51 章核验的 PostgreSQL 18.6 官方镜像摘要。学习 CI 数据库账号只用于临时服务，没有连接生产库；这里的密码是公开、明确的临时 fixture，不应复用到任何长期环境。

```yaml
name: Verify learning blog
on:
  pull_request:
  push:
    branches: [main]
permissions:
  contents: read
concurrency:
  group: verify-${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true
jobs:
  verify:
    runs-on: ubuntu-24.04
    timeout-minutes: 15
    services:
      db:
        image: ${{ vars.COURSE_POSTGRES_IMAGE }}
        env:
          POSTGRES_DB: blog_learning_test
          POSTGRES_PASSWORD: learning-ci-only
        ports: ["5432/tcp"]
        options: >-
          --health-cmd "pg_isready -U postgres -d blog_learning_test"
          --health-interval 10s --health-timeout 5s --health-retries 10
    defaults:
      run:
        shell: bash
    env:
      DATABASE_URL: postgresql://postgres:learning-ci-only@127.0.0.1:${{ job.services.db.ports[5432] }}/blog_learning_test
      ALLOW_LEARNING_DB_TESTS: "1"
    steps:
      - uses: actions/checkout@v7
        with:
          persist-credentials: false
      - uses: actions/setup-node@v7
        with:
          node-version: "24.22.1"
          cache: npm
      - run: npm ci --registry=https://registry.npmjs.org
      - run: npm run check
      - run: npm run verify:security
      - run: npm run migrate
      - run: npm run migrate
      - run: npm run verify:api
      - run: npm run build
```

本项目没有独立 lint 脚本，不能在工作流写一个不存在的 `npm run lint` 再称可运行。接入第 36 章 Biome 后再增加对应门禁；第 50 章的额外并发测试也需实际落地后加入。仓库变量缺失应失败并修配置，不回退到 latest 或真实服务。

缓存 npm 下载内容不是缓存安装结果，仍执行 `npm ci`。锁文件变更只由包管理器生成，安全补丁升级单独审查。CI 的数据库服务 readiness 不能证明迁移成功，所以连续两次迁移检查空库建立与重入；业务测试检查真实密码、授权和事务结果。测试结束后临时数据库被销毁，不挂生产卷。

如果示例放在 monorepo 的 `examples/fullstack-blog/`，需要同时配置工作目录与 `cache-dependency-path` 指向该子项目锁文件。只改 working-directory 而漏掉缓存路径会错误引用根锁文件；在教程站点工作区运行全站流水线也不能代表独立博客已验。

## 52.3 构建产物与发布权限

通过验证后生成 API 镜像与前端静态包，记录摘要、SBOM 和源码关联。发布 job 只读取验证产物，不重新运行不受信任的 PR 脚本。正式仓库可以通过环境审批、受保护分支和工作负载身份获取短期凭据，避免长期 token；短期身份也必须限制目标资源与允许分支。

不要在日志输出完整环境变量或连接字符串，也不要因为平台自动遮蔽 token 就把秘密传入任意脚本。供应链锁定需要包含外部 Action 的 commit SHA、基础镜像 digest 和直接依赖版本；每个来源都必须可追溯到官方仓库，不从博客复制一串不明 SHA。

前端版本与 API 契约应兼容滚动发布。浏览器可能缓存旧前端数小时，CDN 也可能逐步更新，不能假定前后端瞬间一致。API 至少兼容已承诺的旧客户端窗口；静态资源使用内容哈希长期缓存，HTML 采用能及时更新的策略。不能删除仍被旧 HTML 引用的 chunk。

## 52.4 数据库采用扩展、迁移、收缩

新增非空字段时先添加可空或兼容默认值，让旧应用继续工作；部署兼容新旧 schema 的应用；批量回填并验证；最后在后续发布添加约束、删除旧字段。回填按小批次和明确游标推进，不在高峰用一个大事务锁全表。

给 `posts` 新增摘要搜索字段，可以先增加新列并让新应用双写，回填旧记录；新查询暂时兼容空值，确认所有写入者升级后再收紧约束。数据库 schema 回滚与应用回滚不是同一个动作。已经提交的用户数据不能因为回滚应用就自动删除。

迁移由单独受控任务执行，检查 advisory lock、校验和、lock timeout 与 statement timeout。`CREATE INDEX CONCURRENTLY` 不能塞进普通事务式迁移，需要第 41 章的专门非事务流程，并检查无效索引与重入策略。发布启动多个 API 时不能让每个进程同时隐式跑迁移。

破坏性迁移、主版本升级和大规模回填需要明确人工批准与备份恢复证据。自动化可以执行已批准步骤，不替代风险决策；“脚本有 down”不等于恢复无损，删除列后再建回来不会恢复原数据。

## 52.5 发布前后检查与回滚

发布前核对目标环境、摘要、数据库备份时间、迁移计划和当前基线指标。先部署一小部分流量或独立验证实例，检查 readiness、登录、保存、草稿隐私、发布、匿名正文和权限拒绝，再扩大。健康检查 200 只能证明探针条件满足，不证明关键业务能工作。

观察错误率、p95/p99、池等待、CPU/RSS、OOM、认证失败与队列积压。阈值根据业务基线制定：没有流量时零错误没有统计意义，整体延迟正常也可能掩盖某个租户全失败。变更观察窗口要覆盖足够流量和关键任务周期，不只看一分钟。

回滚前先分类：纯代码回归可以切回旧镜像；配置错误可以恢复旧配置；数据损坏需修复数据或恢复；外部服务故障可能需要降级而非回滚。执行旧应用之前核对它能否读取新 schema 和新数据格式，无法兼容时禁止盲目自动回滚。

发布并发组与测试不同：验证可取消旧任务，生产发布不应在迁移中途被新提交随意取消。序列化同环境发布，保留审计记录。回滚动作同样属于外部写入，读者需要具备明确授权，不在诊断命令后顺手执行。

## 52.6 恢复目标与故障演练

RPO 是允许损失多少时间窗口的数据，RTO 是恢复服务可接受的时间；两者由产品与运维共同确定，不从技术名词倒推需求。每日备份不能承诺分钟级 RPO，存在备份文件不能承诺一小时恢复。

在隔离环境恢复到新数据库，应用指向新库，验证迁移、数据数量、登录、草稿隐私、匿名读取与对象引用。需要 PITR 时准备基础备份、WAL 归档、目标时间与恢复配置，保留原库只读证据，不直接覆盖唯一原始数据。切换流量前确认不会由旧 worker 继续写错目标。

演练至少包含坏配置、失败迁移、数据库不可用、镜像启动失败与备份恢复。每次记录发现时间、判断依据、执行动作、恢复时间、残余数据风险和后续整改。不把未经计时的操作手册当已证明的 RTO，也不把单次演练结果推广成所有故障保证。

## 52.7 排错、练习与完成标准

CI 本地通过而线上失败，核对 Node、registry、锁文件、路径大小写、平台原生依赖和数据库版本。数据库服务健康但 API 测试失败，查账号、迁移与端口映射。部署后 chunk 404 查缓存与旧产物保留；迁移锁超时先确认占锁事务，不自动杀掉未知生产会话。

练习为一个非空新字段写三次兼容发布，分别证明旧客户端、新客户端和旧应用回滚窗口；再恢复一份真实学习备份并执行业务测试。完成标准是所有发布产物可追溯、PR 无生产权限、失败门禁阻断发布、迁移有重入与锁策略、回滚检查数据兼容、恢复有实际结果。此章工作流、云端审批和容器发布未经实际运行，不列入配套项目本地通过记录。

## 官方参考

- [actions/checkout 官方说明](https://github.com/actions/checkout)。
- [actions/setup-node 官方说明](https://github.com/actions/setup-node)。
- [GitHub Actions：PostgreSQL 服务容器](https://docs.github.com/en/actions/tutorials/use-containerized-services/create-postgresql-service-containers)。
- [GitHub Actions：部署环境](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments)。
- [PostgreSQL：连续归档与 PITR](https://www.postgresql.org/docs/current/continuous-archiving.html)。

下一章：[OpenTelemetry、安全与隐私](./53-opentelemetry-security-privacy)。
