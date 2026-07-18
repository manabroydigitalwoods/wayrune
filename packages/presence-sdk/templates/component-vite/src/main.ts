type Props = {
  title?: string;
  body?: string;
};

/**
 * Presence mounts this as window.PresenceMount(el, props).
 * Swap the markup for your component; keep the IIFE build so upload works.
 */
function mount(el: HTMLElement, props: Props = {}) {
  const title = props.title || 'Your headline';
  const body = props.body || 'Supporting copy goes here.';
  el.innerHTML = `
    <section class="promo">
      <h2 class="promo__title"></h2>
      <p class="promo__body"></p>
    </section>
  `;
  el.querySelector('.promo__title')!.textContent = title;
  el.querySelector('.promo__body')!.textContent = body;
}

(window as unknown as { PresenceMount: typeof mount }).PresenceMount = mount;
