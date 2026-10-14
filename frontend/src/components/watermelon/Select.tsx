import React, { useState, useRef, useEffect, useCallback, useId } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check, Search } from 'lucide-react';

export interface SelectOption<T = string> {
  value: T;
  label: string;
  description?: string;
  badge?: string;
  icon?: React.ReactNode;
  disabled?: boolean;
}

export interface SimpleSelectProps<T = string> {
  value: T;
  onChange: (value: T) => void;
  options: (SelectOption<T> | string | number)[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  style?: React.CSSProperties;
  menuStyle?: React.CSSProperties;
  size?: 'sm' | 'md';
  prefixIcon?: React.ReactNode;
  searchable?: boolean;
  name?: string;
  title?: string;
}

export function SimpleSelect<T extends string | number>({
  value,
  onChange,
  options,
  placeholder = 'Select an option...',
  disabled = false,
  className = '',
  style,
  menuStyle,
  size = 'sm',
  prefixIcon,
  searchable,
  name,
  title
}: SimpleSelectProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [coords, setCoords] = useState<{ top: number; left: number; width: number; placeAbove: boolean }>({
    top: 0,
    left: 0,
    width: 0,
    placeAbove: false
  });

  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const id = useId();

  // Normalize options into SelectOption<T>
  const normalizedOptions: SelectOption<T>[] = options.map((opt) => {
    if (typeof opt === 'string' || typeof opt === 'number') {
      return {
        value: opt as unknown as T,
        label: String(opt)
      };
    }
    return opt;
  });

  const selectedOption = normalizedOptions.find((opt) => opt.value === value);

  // Compute whether to enable search (explicit or auto for lists > 8 items)
  const isSearchActive = searchable !== undefined ? searchable : normalizedOptions.length > 8;

  const filteredOptions = isSearchActive && searchTerm.trim()
    ? normalizedOptions.filter((opt) =>
        opt.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (opt.description && opt.description.toLowerCase().includes(searchTerm.toLowerCase()))
      )
    : normalizedOptions;

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const estimatedHeight = Math.min(320, filteredOptions.length * 36 + (isSearchActive ? 42 : 12));
    const placeAbove = spaceBelow < estimatedHeight && spaceAbove > spaceBelow;

    setCoords({
      top: placeAbove ? rect.top - 4 : rect.bottom + 4,
      left: Math.max(8, Math.min(rect.left, window.innerWidth - rect.width - 8)),
      width: rect.width,
      placeAbove
    });
  }, [filteredOptions.length, isSearchActive]);

  const handleToggle = () => {
    if (disabled) return;
    if (!isOpen) {
      updatePosition();
      setSearchTerm('');
      setIsOpen(true);
    } else {
      setIsOpen(false);
    }
  };

  // Close when clicking outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        triggerRef.current &&
        !triggerRef.current.contains(target) &&
        menuRef.current &&
        !menuRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    };

    const handleScrollOrResize = () => {
      if (isOpen) {
        updatePosition();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('resize', handleScrollOrResize);
    window.addEventListener('scroll', handleScrollOrResize, true);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('resize', handleScrollOrResize);
      window.removeEventListener('scroll', handleScrollOrResize, true);
    };
  }, [isOpen, updatePosition]);

  // Focus search input when opened
  useEffect(() => {
    if (isOpen && isSearchActive && searchInputRef.current) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    }
  }, [isOpen, isSearchActive]);

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;

    if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
      if (!isOpen) {
        e.preventDefault();
        updatePosition();
        setIsOpen(true);
      }
    } else if (e.key === 'Escape') {
      if (isOpen) {
        e.preventDefault();
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    }
  };

  const handleSelectOption = (opt: SelectOption<T>) => {
    if (opt.disabled) return;
    onChange(opt.value);
    setIsOpen(false);
    triggerRef.current?.focus();
  };

  const height = size === 'sm' ? '30px' : '36px';
  const fontSize = size === 'sm' ? '12px' : '13px';
  const padding = size === 'sm' ? '4px 10px' : '6px 12px';

  return (
    <div style={{ position: 'relative', width: '100%', minWidth: 0 }}>
      {/* Trigger Button */}
      <button
        ref={triggerRef}
        type="button"
        id={id}
        name={name}
        title={title}
        disabled={disabled}
        onClick={handleToggle}
        onKeyDown={handleKeyDown}
        className={`simple-select-trigger ${className}`}
        style={{
          width: '100%',
          minWidth: 0,
          height,
          padding,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '8px',
          background: 'var(--bg-elevated)',
          border: isOpen ? '1px solid var(--accent)' : '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)',
          color: disabled ? 'var(--text-muted)' : 'var(--text-primary)',
          fontSize,
          fontWeight: 500,
          fontFamily: 'inherit',
          textAlign: 'left',
          cursor: disabled ? 'not-allowed' : 'pointer',
          outline: 'none',
          boxSizing: 'border-box',
          opacity: disabled ? 0.6 : 1,
          transition: 'border-color 0.15s ease, background-color 0.15s ease',
          userSelect: 'none',
          ...style
        }}
      >
        <span
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            flex: 1,
            minWidth: 0
          }}
        >
          {prefixIcon && <span style={{ flexShrink: 0 }}>{prefixIcon}</span>}
          {selectedOption?.icon && <span style={{ flexShrink: 0 }}>{selectedOption.icon}</span>}
          <span
            style={{
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              color: selectedOption ? 'var(--text-primary)' : 'var(--text-muted)',
              minWidth: 0
            }}
          >
            {selectedOption ? selectedOption.label : placeholder}
          </span>
        </span>

        <ChevronDown
          size={12}
          style={{
            flexShrink: 0,
            color: 'var(--text-muted)',
            transition: 'transform 0.18s ease',
            transform: isOpen ? 'rotate(180deg)' : 'none'
          }}
        />
      </button>

      {/* Portal Dropdown Menu */}
      {isOpen &&
        createPortal(
          <div
            ref={menuRef}
            className="simple-select-menu"
            style={{
              position: 'fixed',
              top: coords.placeAbove ? 'auto' : `${coords.top}px`,
              bottom: coords.placeAbove ? `${window.innerHeight - coords.top}px` : 'auto',
              left: `${coords.left}px`,
              width: `${Math.max(coords.width, 180)}px`,
              maxHeight: '300px',
              zIndex: 9999999,
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-strong)',
              borderRadius: 'var(--radius-sm)',
              boxShadow: '0 12px 32px rgba(0, 0, 0, 0.55), 0 2px 6px rgba(0, 0, 0, 0.25)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              animation: 'menuFadeIn 0.12s cubic-bezier(0.16, 1, 0.3, 1)',
              ...menuStyle
            }}
          >
            {/* Search Filter when active */}
            {isSearchActive && (
              <div
                style={{
                  padding: '6px 8px',
                  borderBottom: '1px solid var(--border)',
                  background: 'var(--bg-elevated)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <Search size={12} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Filter options..."
                  style={{
                    width: '100%',
                    background: 'transparent',
                    border: 'none',
                    outline: 'none',
                    fontSize: '11.5px',
                    color: 'var(--text-primary)',
                    fontFamily: 'inherit'
                  }}
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
            )}

            {/* Options List */}
            <div
              style={{
                overflowY: 'auto',
                padding: '4px',
                display: 'flex',
                flexDirection: 'column',
                gap: '2px',
                maxHeight: '250px'
              }}
            >
              {filteredOptions.length === 0 ? (
                <div
                  style={{
                    padding: '10px 12px',
                    fontSize: '11.5px',
                    color: 'var(--text-muted)',
                    textAlign: 'center'
                  }}
                >
                  No matching options
                </div>
              ) : (
                filteredOptions.map((opt) => {
                  const isSelected = opt.value === value;
                  return (
                    <div
                      key={String(opt.value)}
                      onClick={() => handleSelectOption(opt)}
                      style={{
                        padding: '6px 10px',
                        borderRadius: 'var(--radius-xs)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '8px',
                        cursor: opt.disabled ? 'not-allowed' : 'pointer',
                        opacity: opt.disabled ? 0.45 : 1,
                        background: isSelected ? 'var(--accent-subtle)' : 'transparent',
                        color: isSelected ? 'var(--accent)' : 'var(--text-primary)',
                        fontSize: '12px',
                        fontWeight: isSelected ? 600 : 400,
                        transition: 'background-color 0.1s ease, color 0.1s ease',
                        userSelect: 'none'
                      }}
                      onMouseEnter={(e) => {
                        if (!isSelected && !opt.disabled) {
                          e.currentTarget.style.backgroundColor = 'var(--bg-hover)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isSelected && !opt.disabled) {
                          e.currentTarget.style.backgroundColor = 'transparent';
                        }
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          overflow: 'hidden',
                          flex: 1
                        }}
                      >
                        {opt.icon && <span style={{ flexShrink: 0 }}>{opt.icon}</span>}
                        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                          <span
                            style={{
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap'
                            }}
                          >
                            {opt.label}
                          </span>
                          {opt.description && (
                            <span style={{ fontSize: '10.5px', color: 'var(--text-muted)', marginTop: '1px' }}>
                              {opt.description}
                            </span>
                          )}
                        </div>
                      </div>

                      {opt.badge && (
                        <span
                          style={{
                            fontSize: '10px',
                            fontWeight: 700,
                            padding: '1px 5px',
                            borderRadius: '4px',
                            background: 'var(--bg-surface)',
                            border: '1px solid var(--border)',
                            color: 'var(--text-secondary)',
                            flexShrink: 0
                          }}
                        >
                          {opt.badge}
                        </span>
                      )}

                      {isSelected && (
                        <Check size={13} style={{ color: 'var(--accent)', flexShrink: 0, marginLeft: '4px' }} />
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
