import { ProgressBar } from 'primereact/progressbar';
import { Button } from 'primereact/button';

interface SyncProgressProps {
  label: string;
  count: string;
  percent: number;
  busy: boolean;
  onStop: () => void;
}

export function SyncProgress({ label, count, percent, busy, onStop }: SyncProgressProps) {
  return (
    <div className="bnf-progress" id="syncProgress">
      <div className="bnf-pline">
        <span>
          {busy && <span className="bnf-spinner" aria-hidden="true" />}
          <span>{label}</span>
        </span>
        <span>{count}</span>
      </div>
      <ProgressBar
        value={busy ? undefined : percent}
        mode={busy ? 'indeterminate' : 'determinate'}
        showValue={false}
        style={{ height: 8 }}
        color="var(--bnf-green)"
      />
      <Button
        size="small"
        outlined
        label="Parar"
        icon="pi pi-stop"
        onClick={onStop}
        style={{ marginTop: 10 }}
      />
    </div>
  );
}
