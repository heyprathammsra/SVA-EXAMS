'use client';

import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';

export interface CustomSelectOption {
  value: string | number;
  label: string;
  meta?: string;
}

interface CustomSelectProps {
  id?: string;
  value: string | number;
  onChange: (value: string) => void;
  options: CustomSelectOption[];
  icon?: React.ReactNode;
  prefixLabel?: string;
  containerClassName?: string;
  triggerClassName?: string;
  chevronClassName?: string;
  menuClassName?: string;
  fullWidth?: boolean;
  matchTriggerWidth?: boolean;
  renderOptionAction?: (
    option: CustomSelectOption,
    closeMenu: () => void
  ) => React.ReactNode;
  renderFooter?: (closeMenu: () => void) => React.ReactNode;
}

export default function CustomSelect({
  id,
  value,
  onChange,
  options,
  icon,
  prefixLabel,
  containerClassName = 'flex items-center gap-2 bg-white border border-slate-200/80 rounded-lg px-2.5 py-1.5 shadow-2xs hover:border-slate-300 transition-colors',
  triggerClassName = 'text-xs font-semibold text-slate-800',
  chevronClassName = 'w-3.5 h-3.5 text-slate-400 shrink-0',
  menuClassName = '',
  fullWidth = false,
  matchTriggerWidth = false,
  renderOptionAction,
  renderFooter,
}: CustomSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [hoveredIndex, setHoveredIndex] = useState<number>(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const selectedOption =
    options.find((opt) => String(opt.value) === String(value)) || options[0];

  const optionsRef = useRef(options);
  const onChangeRef = useRef(onChange);
  const hoveredIndexRef = useRef(hoveredIndex);

  useEffect(() => {
    optionsRef.current = options;
    onChangeRef.current = onChange;
    hoveredIndexRef.current = hoveredIndex;
  }, [options, onChange, hoveredIndex]);

  useEffect(() => {
    if (!isOpen) return;

    const handleOutsideInteraction = (e: Event) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      const opts = optionsRef.current;
      const hIdx = hoveredIndexRef.current;
      if (e.key === 'Escape' || e.key === 'Tab') {
        setIsOpen(false);
      } else if (e.key === 'ArrowDown' && opts.length > 0) {
        e.preventDefault();
        setHoveredIndex((prev) => (prev + 1) % opts.length);
      } else if (e.key === 'ArrowUp' && opts.length > 0) {
        e.preventDefault();
        setHoveredIndex((prev) => (prev - 1 + opts.length) % opts.length);
      } else if (e.key === 'Enter' && hIdx >= 0 && hIdx < opts.length) {
        e.preventDefault();
        onChangeRef.current(String(opts[hIdx].value));
        setIsOpen(false);
      }
    };

    document.addEventListener('pointerdown', handleOutsideInteraction, true);
    document.addEventListener('mousedown', handleOutsideInteraction, true);
    document.addEventListener('click', handleOutsideInteraction, true);
    document.addEventListener('contextmenu', handleOutsideInteraction, true);
    document.addEventListener('focusin', handleOutsideInteraction, true);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('pointerdown', handleOutsideInteraction, true);
      document.removeEventListener('mousedown', handleOutsideInteraction, true);
      document.removeEventListener('click', handleOutsideInteraction, true);
      document.removeEventListener('contextmenu', handleOutsideInteraction, true);
      document.removeEventListener('focusin', handleOutsideInteraction, true);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const closeMenu = () => setIsOpen(false);

  return (
    <div
      ref={wrapperRef}
      onClick={() => {
        setIsOpen((prev) => {
          const next = !prev;
          if (next) {
            const currentIdx = options.findIndex(
              (opt) => String(opt.value) === String(value)
            );
            setHoveredIndex(currentIdx);
          }
          return next;
        });
      }}
      className={`relative select-none cursor-pointer ${fullWidth ? 'w-full' : ''} ${containerClassName}`}
    >
      {(icon || prefixLabel) && (
        <span className="text-xs font-medium text-slate-500 whitespace-nowrap flex items-center gap-1.5">
          {icon}
          {prefixLabel && <span>{prefixLabel}</span>}
        </span>
      )}

      <button
        id={id}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className={`flex items-center justify-between gap-2 bg-transparent focus:outline-none cursor-pointer ${
          fullWidth ? 'w-full flex-1' : ''
        } ${triggerClassName}`}
      >
        <span className="truncate flex items-baseline gap-1.5 min-w-0">
          <span className="truncate">{selectedOption?.label ?? ''}</span>
          {selectedOption?.meta && (
            <span className="text-[11px] font-normal text-slate-400 tabular-nums shrink-0">
              {selectedOption.meta}
            </span>
          )}
        </span>
        <ChevronDown
          className={`${chevronClassName} transition-transform duration-150 ${
            isOpen ? 'rotate-180 text-slate-600' : ''
          }`}
          strokeWidth={2}
        />
      </button>

      {isOpen && (
        <div
          role="listbox"
          onClick={(e) => e.stopPropagation()}
          className={`absolute left-0 top-[calc(100%+6px)] z-50 ${
            matchTriggerWidth ? 'right-0 w-full' : 'w-max min-w-[max(100%,210px)]'
          } bg-white border border-slate-200/90 rounded-xl shadow-[0_18px_40px_-12px_rgba(15,23,42,0.16),0_4px_14px_-4px_rgba(15,23,42,0.06)] ring-1 ring-slate-900/[0.04] p-1.5 max-h-[380px] overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] flex flex-col gap-0.5 animate-in fade-in zoom-in-95 duration-150 ${menuClassName}`}
        >
          {options.map((opt, idx) => {
            const isSelected = String(opt.value) === String(value);
            const isHovered = hoveredIndex === idx;
            const rightAction = renderOptionAction
              ? renderOptionAction(opt, closeMenu)
              : null;

            if (rightAction) {
              return (
                <div
                  key={String(opt.value)}
                  onMouseEnter={() => setHoveredIndex(idx)}
                  onMouseLeave={() => setHoveredIndex(-1)}
                  className={`group/item flex items-center justify-between gap-1 rounded-lg pr-1 transition-colors duration-100 ${
                    isSelected
                      ? 'bg-blue-50/85 text-blue-700'
                      : isHovered
                      ? 'bg-slate-100/85 text-slate-900'
                      : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <button
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => {
                      onChange(String(opt.value));
                      setIsOpen(false);
                    }}
                    className={`flex-1 min-w-0 pl-2.5 pr-1 py-2 text-xs whitespace-nowrap cursor-pointer flex items-center justify-between gap-2 text-left bg-transparent focus:outline-none ${
                      isSelected ? 'font-semibold text-blue-700' : 'font-medium text-inherit'
                    }`}
                  >
                    <span className="flex items-center gap-1.5 min-w-0">
                      <span className="truncate">{opt.label}</span>
                      {isSelected && (
                        <Check
                          className="w-3.5 h-3.5 text-blue-600 shrink-0"
                          strokeWidth={2.25}
                        />
                      )}
                    </span>
                    {opt.meta && (
                      <span
                        className={`text-[11px] font-normal tabular-nums shrink-0 ${
                          isSelected ? 'text-blue-600/80' : 'text-slate-400'
                        }`}
                      >
                        {opt.meta}
                      </span>
                    )}
                  </button>
                  <div className="shrink-0 flex items-center">{rightAction}</div>
                </div>
              );
            }

            return (
              <div
                key={String(opt.value)}
                role="option"
                aria-selected={isSelected}
                onMouseEnter={() => setHoveredIndex(idx)}
                onMouseLeave={() => setHoveredIndex(-1)}
                onClick={() => {
                  onChange(String(opt.value));
                  setIsOpen(false);
                }}
                className={`rounded-lg px-2.5 py-2 text-xs whitespace-nowrap cursor-pointer transition-colors duration-100 flex items-center justify-between gap-4 ${
                  isSelected
                    ? 'bg-blue-50/85 text-blue-700 font-semibold'
                    : isHovered
                    ? 'bg-slate-100/85 text-slate-900'
                    : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                <span className="truncate">{opt.label}</span>
                <span className="flex items-center gap-2 shrink-0">
                  {opt.meta && (
                    <span
                      className={`text-[11px] font-normal tabular-nums ${
                        isSelected ? 'text-blue-600/80' : 'text-slate-400'
                      }`}
                    >
                      {opt.meta}
                    </span>
                  )}
                  {isSelected && (
                    <Check
                      className="w-3.5 h-3.5 text-blue-600 shrink-0"
                      strokeWidth={2.25}
                    />
                  )}
                </span>
              </div>
            );
          })}

          {renderFooter && (
            <div className="mt-1 pt-1 border-t border-slate-100">
              {renderFooter(closeMenu)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
