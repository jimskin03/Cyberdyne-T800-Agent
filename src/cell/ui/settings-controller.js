import './settings.css';

export function createSettingsController({
  document = globalThis.document,
  onClose = () => {},
  onOpen = () => {},
  onSectionChange = () => {},
} = {}) {
  const $ = (id) => document.getElementById(id);
  const dialog = $('settings'),
    toggle = $('settings-toggle');
  const tabs = [$('settings-mind-tab'), $('settings-mcp-tab')];
  function select(tab, focus = false) {
    const changed = tab.getAttribute('aria-selected') !== 'true';
    for (const item of tabs) {
      const selected = item === tab;
      item.setAttribute('aria-selected', String(selected));
      item.tabIndex = selected ? 0 : -1;
      $(item.getAttribute('aria-controls')).hidden = !selected;
    }
    if (focus) tab.focus();
    if (changed) onSectionChange();
  }
  const open = () => {
    if (dialog.open) return;
    document.dispatchEvent(new Event('cell:settings-open'));
    dialog.showModal();
    toggle.setAttribute('aria-expanded', 'true');
    onOpen();
  };
  const close = () => dialog.close();
  const closed = () => {
    toggle.setAttribute('aria-expanded', 'false');
    onClose();
    toggle.focus({preventScroll: true});
  };
  // Let the dialog handle Tab and Escape while preventing scene shortcuts.
  const keydown = (event) => {
    if (dialog.open) event.stopPropagation();
  };
  const tabKey = (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const index = tabs.indexOf(event.currentTarget);
    select(
      tabs[
        event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? tabs.length - 1
            : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length
      ],
      true,
    );
  };
  toggle.addEventListener('click', open);
  $('settings-close').addEventListener('click', close);
  dialog.addEventListener('close', closed);
  dialog.addEventListener('keydown', keydown);
  for (const tab of tabs) {
    tab.onclick = () => select(tab);
    tab.addEventListener('keydown', tabKey);
  }
  const observer = new MutationObserver(() => {
    if (
      dialog.open &&
      ['clean', 'pc-open', 'berserker-mode'].some((name) => document.body.classList.contains(name))
    )
      close();
  });
  observer.observe(document.body, {attributes: true, attributeFilter: ['class']});
  return {
    open,
    close,
    destroy() {
      if (dialog.open) close();
      observer.disconnect();
      toggle.removeEventListener('click', open);
      $('settings-close').removeEventListener('click', close);
      dialog.removeEventListener('close', closed);
      dialog.removeEventListener('keydown', keydown);
      for (const tab of tabs) {
        tab.onclick = null;
        tab.removeEventListener('keydown', tabKey);
      }
    },
  };
}
