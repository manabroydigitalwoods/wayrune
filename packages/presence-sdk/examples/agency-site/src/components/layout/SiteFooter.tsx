import footerHtml from '@site/chrome/footer.html?raw';

export function SiteFooter() {
  return <div dangerouslySetInnerHTML={{ __html: footerHtml }} />;
}
