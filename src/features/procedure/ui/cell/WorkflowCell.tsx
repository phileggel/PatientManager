import type { ReactNode } from "react";
import type { WorkflowStep } from "../../model";

interface WorkflowCellProps {
  rowId: string;
  step: WorkflowStep;
  activeRowId: string | null;
  activeStep: WorkflowStep;

  // what component to render in read mode
  children: ReactNode;

  // the input/select component to render in edit mode
  editor: ReactNode;

  className?: string;

  /** callback to notify the orchestrator that this cell wants the focus */
  onActivate: (rowId: string, step: WorkflowStep) => void;
}

export const WorkflowCell = ({
  rowId,
  step,
  activeRowId,
  activeStep,
  children,
  editor,
  onActivate,
  className = "",
}: WorkflowCellProps) => {
  const isEditing = activeRowId === rowId && activeStep === step;

  const handleCellClick = () => {
    if (!isEditing) {
      onActivate(rowId, step);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isEditing && (e.key === "Enter" || e.key === " ")) {
      // Prevent page scroll when pressing Space
      e.preventDefault();
      onActivate(rowId, step);
    }
  };

  return (
    <td
      className={`workflow-cell ${isEditing ? "is-editing" : "is-static"} ${className}`}
      data-row-id={rowId}
      data-step={step}
      onClick={isEditing ? undefined : handleCellClick}
      onKeyDown={handleKeyDown}
      tabIndex={isEditing ? -1 : 0}
    >
      {isEditing ? (
        <div className="workflow-editor-wrapper">{editor}</div>
      ) : (
        <div className="workflow-display-wrapper">{children}</div>
      )}
    </td>
  );
};
