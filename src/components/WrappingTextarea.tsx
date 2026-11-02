import { useLayoutEffect, useRef, type TextareaHTMLAttributes } from "react";

/** Prose stays readable as it grows, without horizontal caret navigation. */
export function WrappingTextarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const field = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const node = field.current;
    if (!node) return;
    const resize = () => {
      node.style.height = "auto";
      node.style.height = `${node.scrollHeight + 2}px`;
    };
    resize();
    const observer = new ResizeObserver(entries => {
      const width = entries[0]?.contentRect.width;
      if (width !== previousWidth) { previousWidth = width; resize(); }
    });
    let previousWidth = node.getBoundingClientRect().width;
    observer.observe(node);
    return () => observer.disconnect();
  }, [props.value]);
  return <textarea {...props} ref={field} />;
}
