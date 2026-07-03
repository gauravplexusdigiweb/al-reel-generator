'use client';

import { useEffect, useState } from 'react';
import type { CategoryDto } from '@arg/shared';
import { api } from '@/lib/api';
import { Folder, FolderOpen, ChevronRight, ChevronDown, Film } from 'lucide-react';
import { cn } from '@/lib/utils';

function CategoryNode({
  cat,
  selectedId,
  onSelect,
  depth = 0,
}: {
  cat: CategoryDto;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  depth?: number;
}) {
  const [expanded, setExpanded] = useState(depth < 1);
  const isSelected = selectedId === cat.id;
  const hasChildren = cat.children.length > 0;

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        onClick={() => onSelect(isSelected ? null : cat.id)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelect(isSelected ? null : cat.id);
          }
        }}
        className={cn(
          'flex cursor-pointer items-center gap-1 rounded-md py-1.5 pr-2 text-sm transition-colors hover:bg-accent',
          isSelected && 'bg-accent text-accent-foreground',
        )}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        {hasChildren ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(!expanded);
            }}
            className="shrink-0"
          >
            {expanded ? (
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            )}
          </button>
        ) : (
          <span className="w-3.5 shrink-0" />
        )}
        {isSelected ? (
          <FolderOpen className="h-4 w-4 shrink-0 text-primary" />
        ) : (
          <Folder className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        <span className="truncate">{cat.name}</span>
        <span className="ml-auto text-xs text-muted-foreground">{cat.videoCount}</span>
      </div>
      {expanded &&
        hasChildren &&
        cat.children.map((child) => (
          <CategoryNode
            key={child.id}
            cat={child}
            selectedId={selectedId}
            onSelect={onSelect}
            depth={depth + 1}
          />
        ))}
    </div>
  );
}

export function CategorySidebar({
  selectedId,
  onSelect,
}: {
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const [categories, setCategories] = useState<CategoryDto[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const tree = await api.getCategories();
        if (active) setCategories(tree);
      } catch {
        /* silent */
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    const t = setInterval(load, 15000);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, []);

  return (
    <div className="space-y-1">
      <div
        onClick={() => onSelect(null)}
        className={cn(
          'flex cursor-pointer items-center gap-2 rounded-md py-1.5 px-2 text-sm transition-colors hover:bg-accent',
          selectedId === null && 'bg-accent text-accent-foreground',
        )}
      >
        <Film className="h-4 w-4 text-muted-foreground" />
        <span>All videos</span>
      </div>
      {loading && categories.length === 0 && (
        <p className="px-2 py-1 text-xs text-muted-foreground">Loading…</p>
      )}
      {!loading && categories.length === 0 && (
        <p className="px-2 py-1 text-xs text-muted-foreground">
          No categories yet.{' '}
          <a href="/categories" className="underline hover:text-foreground">
            Create one
          </a>
        </p>
      )}
      {categories.map((cat) => (
        <CategoryNode
          key={cat.id}
          cat={cat}
          selectedId={selectedId}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}