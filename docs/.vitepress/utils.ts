/**
 * @param {string} pathname pathname 值
 * @returns {SidebarItem[]} 侧边栏数组
 */
export const getSideBarList = (pathname: string) => {
    if (['/basic', '/core', '/api'].includes(pathname)) {
        return [
            {
                text: '基础篇',
                items: [
                    { text: '基础篇', link: '/basic/index' },
                    { text: '基础篇1', link: '/basic/basic1' },
                    { text: '基础篇2', link: '/basic/basic2' }
                ]
            },
            {
                text: 'API 篇',
                items: [
                    { text: 'API篇', link: '/api/index' },
                    { text: 'API篇1', link: '/api/api1' },
                    { text: 'API篇2', link: '/api/api2' }
                ]
            },
            {
                text: '核心篇',
                items: [
                    { text: '核心篇', link: '/core/index' },
                    { text: '核心篇1', link: '/core/core1' },
                    { text: '核心篇2', link: '/core/core2' }
                ]
            }
        ]
    }
    return [
        {
            text: '教学篇',
            items: [
                { text: '教学篇', link: '/teach/index' },
                { text: '教学篇1', link: '/teach/teach1' },
                { text: '教学篇2', link: '/teach/teach2' }
            ]
        },
        {
            text: '总结篇',
            items: [
                { text: '总结篇', link: '/summarize/index' },
                { text: '总结篇1', link: '/summarize/summarize1' },
                { text: '总结篇2', link: '/summarize/summarize2' }
            ]
        },
        {
            text: '团队篇',
            items: [
                { text: '团队篇', link: '/team/index' },
                { text: '团队篇1', link: '/team/team1' },
                { text: '团队篇2', link: '/team/team2' }
            ]
        }
    ]
}
