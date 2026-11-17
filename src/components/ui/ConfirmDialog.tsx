"use client";

import { AnimatePresence, motion } from "framer-motion";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open, title, description, confirmLabel = "Удалить", onConfirm, onCancel,
}: ConfirmDialogProps) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-fern-950/60 p-4 backdrop-blur-sm"
          onClick={onCancel}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="glass-strong w-[360px] max-w-full rounded-3xl p-6"
            role="dialog"
            aria-modal="true"
          >
            <h3 className="text-[15px] font-medium text-foreground">{title}</h3>
            {description && (
              <p className="mt-2 text-[13px] leading-relaxed text-[rgba(220,235,230,0.78)]">
                {description}
              </p>
            )}
            <div className="mt-5 flex justify-end gap-2.5">
              <button
                onClick={onCancel}
                className="rounded-xl px-4 py-2 text-[13px] text-dim transition-colors hover:bg-white/[0.06] hover:text-foreground"
              >
                Отмена
              </button>
              <button
                onClick={onConfirm}
                className="rounded-xl border border-red-400/30 bg-red-500/15 px-4 py-2 text-[13px] text-red-300 transition-colors hover:bg-red-500/25"
              >
                {confirmLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
