import headerHtml from '@site/chrome/header.html?raw';

export function SiteHeader() {
  return <div dangerouslySetInnerHTML={{ __html: headerHtml }} />;
}
