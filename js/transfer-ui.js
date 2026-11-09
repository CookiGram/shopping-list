/* Small error-state UI helper for the CookiGram transfer receiver. */
export const showTransferError = ({ panel, status, confirm, cancel, undo, message }) => {
  panel.hidden = false;
  status.textContent = message || "Transfert invalide";
  if (confirm) confirm.hidden = true;
  if (undo) undo.hidden = true;
  if (cancel) {
    cancel.hidden = false;
    cancel.addEventListener("click", () => { panel.hidden = true; });
  }
};
