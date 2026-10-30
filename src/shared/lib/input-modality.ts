export function trackInputModality(doc: Document) {
  const root = doc.documentElement;
  const pointer = () => { root.dataset.inputModality = "pointer"; };
  const keyboard = (event: KeyboardEvent) => {
    if (["Shift", "Control", "Alt", "Meta"].includes(event.key)) return;
    root.dataset.inputModality = "keyboard";
  };
  doc.addEventListener("pointerdown", pointer, true);
  doc.addEventListener("keydown", keyboard, true);
  return () => {
    doc.removeEventListener("pointerdown", pointer, true);
    doc.removeEventListener("keydown", keyboard, true);
    delete root.dataset.inputModality;
  };
}
