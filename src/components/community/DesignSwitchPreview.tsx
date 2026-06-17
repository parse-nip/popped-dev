function DesignCursorIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M3.2 2.1 12.4 8.2a.45.45 0 0 1 0 .76L3.2 14.9V2.1Z" fill="currentColor" />
      <rect
        x="8.5"
        y="8.5"
        width="5.5"
        height="5.5"
        rx="1"
        stroke="currentColor"
        strokeWidth="1.2"
        fill="none"
      />
    </svg>
  );
}

type DesignSwitchPreviewProps = {
  active?: boolean;
};

export function DesignSwitchPreview({ active = false }: DesignSwitchPreviewProps) {
  return (
    <span
      className={
        active
          ? "welcome-design-preview site-header-design-switch site-header-design-switch--on"
          : "welcome-design-preview site-header-design-switch"
      }
      aria-hidden="true"
    >
      <span className="site-header-design-switch-icon">
        <DesignCursorIcon />
      </span>
      <span className="site-header-design-switch-label">Design</span>
      <span className="site-header-design-switch-track">
        <span className="site-header-design-switch-thumb" />
      </span>
    </span>
  );
}
