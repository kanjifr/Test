"use client";

export function ConfirmButton({
  message,
  children,
  className,
  disabled,
}: {
  message: string;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="submit"
      className={className}
      disabled={disabled}
      onClick={(e) => {
        if (!confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
