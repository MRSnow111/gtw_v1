"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface AdminModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}

export function AdminModal({ isOpen, onClose, title, children, footer }: AdminModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative glass-strong rounded-[28px] p-6 w-full max-w-lg max-h-[80vh] flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-[rgba(220,235,230,0.9)]">{title}</h2>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-[rgba(165,187,179,0.6)] hover:text-[rgba(220,235,230,0.9)] hover:bg-[rgba(143,184,174,0.1)] transition-all"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M1 1l12 12M13 1L1 13" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto soft-scrollbar">
          {children}
        </div>
        {footer && (
          <div className="flex justify-end gap-2 pt-2 border-t border-[rgba(220,235,230,0.08)]">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
