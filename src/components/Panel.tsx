import { PropsWithChildren, ReactNode } from "react";

interface PanelProps extends PropsWithChildren {
  title: string;
  eyebrow?: string;
  actions?: ReactNode;
  className?: string;
}

export function Panel({
  title,
  eyebrow,
  actions,
  className,
  children
}: PanelProps) {
  return (
    <section className={`panel ${className ?? ""}`.trim()}>
      <header className="panel__header">
        <div>
          {eyebrow ? <p className="panel__eyebrow">{eyebrow}</p> : null}
          <h2 className="panel__title">{title}</h2>
        </div>
        {actions ? <div className="panel__actions">{actions}</div> : null}
      </header>
      <div className="panel__content">{children}</div>
    </section>
  );
}
