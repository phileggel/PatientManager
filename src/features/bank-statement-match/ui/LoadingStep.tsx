import { Loader } from "lucide-react";

interface LoadingStepProps {
  message: string;
}

export function LoadingStep({ message }: LoadingStepProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-4">
      <Loader className="w-8 h-8 animate-spin text-m3-primary" />
      <p className="text-m3-on-surface-variant">{message}</p>
    </div>
  );
}
