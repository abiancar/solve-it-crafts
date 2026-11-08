(() => {
  function markDotPrompts() {
    document.querySelectorAll('.editable').forEach(editable => {
      const prompt = editable.querySelector(
        '.msg-card.card-in[data-mtype="prompt"]'
      );
      const body = prompt?.querySelector('.msg-body');
      const isDot = body?.textContent.trim() === '.';

      editable.classList.toggle('dot-prompt', isDot);
    });
  }

  markDotPrompts();

  new MutationObserver(markDotPrompts).observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true
  });
})();
