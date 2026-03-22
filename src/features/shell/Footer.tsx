interface FooterProps {
  appName: string;
  version?: string;
}

export function Footer({ appName, version }: FooterProps) {
  return (
    <footer className="shrink-0 py-1 px-4 flex justify-end">
      <p className="m-0 text-xs italic text-m3-on-surface-variant">
        {appName}
        {version && <span> v{version}</span>}
      </p>
    </footer>
  );
}
