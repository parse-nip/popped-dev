import {
  designIdSelector,
  type EditOperation,
} from "@shared/edit-operations";

const revertByPatchId = new Map<string, () => void>();

function resolveTarget(targetId: string): Element | null {
  if (typeof document === "undefined") return null;
  return document.querySelector(designIdSelector(targetId));
}

function camelToCss(property: string): string {
  return property.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`);
}

function collectOperationRevert(op: EditOperation): (() => void) | null {
  const node = resolveTarget(op.target);
  if (!node || !(node instanceof HTMLElement)) return null;
  const el = node;

  if (op.type === "style") {
    const prop = camelToCss(op.property);
    const prev = el.style.getPropertyValue(prop);
    const priority = op.important ? "important" : "";
    el.style.setProperty(prop, op.value, priority);
    return () => {
      if (prev) el.style.setProperty(prop, prev);
      else el.style.removeProperty(prop);
    };
  }

  if (op.type === "class_toggle") {
    const had = el.classList.contains(op.className);
    el.classList.toggle(op.className, op.enabled);
    return () => {
      el.classList.toggle(op.className, had);
    };
  }

  if (op.type === "visibility") {
    const prev = el.style.opacity;
    el.style.opacity = op.visible ? "1" : "0.35";
    return () => {
      el.style.opacity = prev;
    };
  }

  if (op.type === "spacing") {
    const prevPadding = el.style.padding;
    const prevMargin = el.style.margin;
    if (op.padding) el.style.padding = op.padding;
    if (op.margin) el.style.margin = op.margin;
    return () => {
      el.style.padding = prevPadding;
      el.style.margin = prevMargin;
    };
  }

  if (op.type === "insert_image") {
    const wrapper = document.createElement("span");
    wrapper.style.display = "inline-flex";
    wrapper.style.alignItems = "center";
    wrapper.style.marginInlineEnd = "0.5rem";

    const img = document.createElement("img");
    img.src = op.src;
    img.alt = op.alt ?? "";
    if (op.className) img.className = op.className;
    img.style.height = "1.25rem";
    img.style.width = "auto";
    wrapper.appendChild(img);

    if (op.position === "start") {
      el.prepend(wrapper);
    } else {
      el.append(wrapper);
    }

    return () => {
      wrapper.remove();
    };
  }

  return null;
}

export function applyPreviewOperations(operations: EditOperation[], patchId: string): void {
  removePreviewPatch(patchId);

  const reverts: Array<() => void> = [];

  for (const op of operations) {
    const revert = collectOperationRevert(op);
    if (revert) reverts.push(revert);
  }

  revertByPatchId.set(patchId, () => {
    for (const revert of reverts.reverse()) {
      revert();
    }
  });
}

export function removePreviewPatch(patchId: string): void {
  revertByPatchId.get(patchId)?.();
  revertByPatchId.delete(patchId);
}

export function clearAllPreviewPatches(): void {
  for (const patchId of [...revertByPatchId.keys()]) {
    removePreviewPatch(patchId);
  }
}

export function reapplyPreviewPatches(
  patches: Array<{ id: string; preview: { operations: EditOperation[] } }>,
): void {
  clearAllPreviewPatches();
  for (const patch of patches) {
    if (patch.preview.operations.length > 0) {
      applyPreviewOperations(patch.preview.operations, patch.id);
    }
  }
}
