const robots = `User-agent: *
Allow: /
Sitemap: https://abinzhao.github.io/abinzhao/sitemap-index.xml
`;

export function GET() {
  return new Response(robots, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}
