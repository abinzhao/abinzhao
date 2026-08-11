const robots = `User-agent: *
Allow: /
Sitemap: https://abinzhao.github.io/sitemap-index.xml
`;

export function GET() {
  return new Response(robots, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}
