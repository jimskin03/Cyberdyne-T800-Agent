export function createIntercomController({
  document = globalThis.document,
  canSend = () => true,
  onSend,
} = {}) {
  const input = document.getElementById('ask');
  const button = document.getElementById('ask-btn');

  function submit() {
    const text = String(input.value || '')
      .trim()
      .slice(0, 300);
    if (!text || !canSend()) return false;
    input.value = '';
    onSend(text);
    return true;
  }

  button.onclick = submit;
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      submit();
    }
    event.stopPropagation();
  });

  return {submit};
}
