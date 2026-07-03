'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { ArrowLeft, Plus, Trash2, Edit2, FolderPlus, Folder, ChevronRight, ChevronDown } from 'lucide-react';
import type { CategoryDto } from '@arg/shared';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';

function flattenForSelect(cats: CategoryDto[], excludeId?: string, depth = 0): Array<{ id: string; name: string; depth: number }> {
  const result: Array<{ id: string; name: string; depth: number }> = [];
  for (const c of cats) {
    if (c.id !== excludeId) {
      result.push({ id: c.id, name: c.name, depth });
      result.push(...flattenForSelect(c.children, excludeId, depth + 1));
    }
  }
  return result;
}

interface TreeItem {
  cat: CategoryDto;
  parent: string | null;
}

function flattenToItems(cats: CategoryDto[], parent: string | null = null): TreeItem[] {
  const items: TreeItem[] = [];
  for (const c of cats) {
    items.push({ cat: c, parent });
    items.push(...flattenToItems(c.children, c.id));
  }
  return items;
}

function CategoryTreeItem({
  cat,
  depth,
  onAddChild,
  onRename,
  onDelete,
}: {
  cat: CategoryDto;
  depth: number;
  onAddChild: (parentId: string) => void;
  onRename: (cat: CategoryDto) => void;
  onDelete: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(depth < 1);
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState(cat.name);
  const hasChildren = cat.children.length > 0;

  async function saveRename() {
    if (newName.trim() && newName !== cat.name) {
      try {
        await api.updateCategory(cat.id, { name: newName.trim() });
        toast.success('Category renamed');
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Failed to rename');
      }
    }
    setRenaming(false);
  }

  return (
    <div>
      <div
        className="flex items-center gap-1 rounded-md py-1.5 px-2 hover:bg-accent/50 transition-colors"
        style={{ marginLeft: `${depth * 20}px` }}
      >
        {hasChildren ? (
          <button onClick={() => setExpanded(!expanded)} className="shrink-0">
            {expanded ? (
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            )}
          </button>
        ) : (
          <span className="w-3.5 shrink-0" />
        )}
        <Folder className="h-4 w-4 shrink-0 text-muted-foreground" />
        {renaming ? (
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onBlur={saveRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') saveRename();
              if (e.key === 'Escape') {
                setNewName(cat.name);
                setRenaming(false);
              }
            }}
            className="h-6 flex-1 text-sm"
            autoFocus
          />
        ) : (
          <span className="flex-1 text-sm">{cat.name}</span>
        )}
        <span className="text-xs text-muted-foreground">{cat.videoCount} videos</span>
        <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => onAddChild(cat.id)} title="Add subcategory">
          <FolderPlus className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => setRenaming(true)} title="Rename">
          <Edit2 className="h-3.5 w-3.5" />
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0 hover:text-destructive" title="Delete">
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete &ldquo;{cat.name}&rdquo;?</AlertDialogTitle>
              <AlertDialogDescription>
                This will delete the category, all subcategories, and remove category assignments from videos and reels. Videos themselves are not deleted.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => onDelete(cat.id)}>Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
      {expanded &&
        cat.children.map((child) => (
          <CategoryTreeItem
            key={child.id}
            cat={child}
            depth={depth + 1}
            onAddChild={onAddChild}
            onRename={onRename}
            onDelete={onDelete}
          />
        ))}
    </div>
  );
}

export default function CategoriesPage() {
  const [categories, setCategories] = useState<CategoryDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createParent, setCreateParent] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setCategories(await api.getCategories());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load categories');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function handleCreate() {
    if (!createName.trim()) return;
    try {
      await api.createCategory({ name: createName.trim(), parentId: createParent });
      setCreateName('');
      setCreateParent(null);
      setShowCreate(false);
      void reload();
      toast.success('Category created');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to create category');
    }
  }

  async function handleDelete(id: string) {
    try {
      await api.deleteCategory(id);
      void reload();
      toast.success('Category deleted');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to delete');
    }
  }

  function handleAddChild(parentId: string) {
    setCreateParent(parentId);
    setShowCreate(true);
  }

  const flatForSelect = flattenForSelect(categories);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link href="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back
      </Link>

      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Categories</h1>
        <Button onClick={() => { setShowCreate(!showCreate); setCreateParent(null); setCreateName(''); }}>
          <Plus className="mr-1 h-4 w-4" /> New category
        </Button>
      </div>

      {showCreate && (
        <Card>
          <CardContent className="space-y-3 pt-4">
            <div className="space-y-1.5">
              <Label>Category name</Label>
              <Input
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder="e.g. Podcasts, Tech, Interviews"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreate();
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Parent (optional)</Label>
              <Select value={createParent ?? '__root'} onValueChange={(v) => setCreateParent(v === '__root' ? null : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Root category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__root">Root (no parent)</SelectItem>
                  {flatForSelect.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {'\u00A0'.repeat(c.depth * 2)}{c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleCreate} disabled={!createName.trim()}>
                Create
              </Button>
              <Button variant="outline" onClick={() => setShowCreate(false)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Category tree</CardTitle>
        </CardHeader>
        <CardContent>
          {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {!loading && categories.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No categories yet. Create one to organize your videos and reels.
            </p>
          )}
          {categories.length > 0 && (
            <div className="space-y-0.5">
              {categories.map((cat) => (
                <CategoryTreeItem
                  key={cat.id}
                  cat={cat}
                  depth={0}
                  onAddChild={handleAddChild}
                  onRename={() => {}}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}