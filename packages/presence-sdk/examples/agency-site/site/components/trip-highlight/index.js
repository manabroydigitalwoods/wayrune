(function () {
  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  window.PresenceMount = function (el, props) {
    var p = props || {};
    var eyebrow = escapeHtml(p.eyebrow || '');
    var title = escapeHtml(p.title || 'Featured trip');
    var body = escapeHtml(p.body || '');
    var price = escapeHtml(p.price || '');
    var ctaLabel = escapeHtml(p.ctaLabel || 'Enquire');
    var ctaHref = escapeHtml(p.ctaHref || '/contact');
    el.innerHTML =
      '<section class="trip-highlight">' +
      (eyebrow ? '<p class="eyebrow">' + eyebrow + '</p>' : '') +
      '<h2>' +
      title +
      '</h2>' +
      (body ? '<p>' + body + '</p>' : '') +
      '<div class="meta">' +
      (price ? '<span class="price">' + price + '</span>' : '') +
      '<a href="' +
      ctaHref +
      '">' +
      ctaLabel +
      '</a>' +
      '</div></section>';
  };
})();
