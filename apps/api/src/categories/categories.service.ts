import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { CategoryDto } from '@arg/shared';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async getTree(): Promise<CategoryDto[]> {
    const categories = await this.prisma.category.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    return this.buildTree(categories);
  }

  async create(name: string, parentId?: string | null): Promise<CategoryDto> {
    if (parentId) {
      const parent = await this.prisma.category.findUnique({ where: { id: parentId } });
      if (!parent) throw new NotFoundException('Parent category not found');
    }
    await this.ensureNoCycle(undefined, parentId);

    const category = await this.prisma.category.create({
      data: { name: name.trim(), parentId: parentId ?? null },
    });
    return this.toDto(category, 0, 0);
  }

  async update(id: string, data: { name?: string; sortOrder?: number; parentId?: string | null }): Promise<CategoryDto> {
    const existing = await this.prisma.category.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Category not found');

    if (data.parentId !== undefined) {
      if (data.parentId) {
        const parent = await this.prisma.category.findUnique({ where: { id: data.parentId } });
        if (!parent) throw new NotFoundException('Parent category not found');
      }
      await this.ensureNoCycle(id, data.parentId);
    }

    const updateData: { name?: string; sortOrder?: number; parentId?: string | null } = {};
    if (data.name !== undefined) updateData.name = data.name.trim();
    if (data.sortOrder !== undefined) updateData.sortOrder = data.sortOrder;
    if (data.parentId !== undefined) updateData.parentId = data.parentId || null;

    const category = await this.prisma.category.update({ where: { id }, data: updateData });
    const counts = await this.getCounts(category.id);
    return this.toDto(category, counts.videos, counts.reels);
  }

  async remove(id: string): Promise<void> {
    const category = await this.prisma.category.findUnique({ where: { id } });
    if (!category) throw new NotFoundException('Category not found');
    await this.prisma.category.delete({ where: { id } });
  }

  async getVideos(categoryId: string, recursive = false): Promise<{ id: string }[]> {
    if (!recursive) {
      return this.prisma.video.findMany({
        where: { categoryId },
        select: { id: true },
        orderBy: { createdAt: 'desc' },
      });
    }
    const ids = await this.collectDescendantIds(categoryId);
    ids.push(categoryId);
    return this.prisma.video.findMany({
      where: { categoryId: { in: ids } },
      select: { id: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getReels(categoryId: string, recursive = false): Promise<{ id: string }[]> {
    const ids = recursive ? await this.collectDescendantIds(categoryId) : [];
    ids.push(categoryId);
    return this.prisma.reel.findMany({
      where: { categoryId: { in: ids } },
      select: { id: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async ensureNoCycle(categoryId: string | undefined, newParentId: string | null | undefined): Promise<void> {
    if (!newParentId) return;
    if (categoryId && categoryId === newParentId) {
      throw new BadRequestException('A category cannot be its own parent');
    }
    let current: string | null = newParentId;
    const visited = new Set<string>([newParentId]);
    while (current) {
      const cat: { parentId: string | null } | null = await this.prisma.category.findUnique({
        where: { id: current },
        select: { parentId: true },
      });
      if (!cat) break;
      current = cat.parentId;
      if (current && visited.has(current)) {
        throw new BadRequestException('Circular reference detected in category tree');
      }
      if (current) visited.add(current);
    }
    if (categoryId && visited.has(categoryId)) {
      throw new BadRequestException('Moving this category would create a circular reference');
    }
  }

  private async collectDescendantIds(categoryId: string): Promise<string[]> {
    const all = await this.prisma.category.findMany({ select: { id: true, parentId: true } });
    const childrenMap = new Map<string | null, string[]>();
    for (const c of all) {
      const arr = childrenMap.get(c.parentId) ?? [];
      arr.push(c.id);
      childrenMap.set(c.parentId, arr);
    }
    const result: string[] = [];
    const queue = [categoryId];
    while (queue.length) {
      const id = queue.shift()!;
      const children = childrenMap.get(id) ?? [];
      for (const child of children) {
        result.push(child);
        queue.push(child);
      }
    }
    return result;
  }

  private buildTree(
    categories: Array<{
      id: string;
      name: string;
      parentId: string | null;
      sortOrder: number;
      createdAt: Date;
    }>,
  ): CategoryDto[] {
    const counts = new Map<string, { videos: number; reels: number }>();
    return categories
      .filter((c) => !c.parentId)
      .map((c) => this.buildNode(c, categories, counts));
  }

  private buildNode(
    cat: { id: string; name: string; parentId: string | null; sortOrder: number; createdAt: Date },
    all: Array<{ id: string; name: string; parentId: string | null; sortOrder: number; createdAt: Date }>,
    counts: Map<string, { videos: number; reels: number }>,
  ): CategoryDto {
    const childDtos: CategoryDto[] = all
      .filter((c) => c.parentId === cat.id)
      .map((c) => this.buildNode(c, all, counts));

    const count = counts.get(cat.id) ?? { videos: 0, reels: 0 };
    return {
      id: cat.id,
      name: cat.name,
      parentId: cat.parentId,
      sortOrder: cat.sortOrder,
      videoCount: count.videos,
      reelCount: count.reels,
      children: childDtos,
      createdAt: cat.createdAt.toISOString(),
    };
  }

  private async getCounts(categoryId: string): Promise<{ videos: number; reels: number }> {
    const [videos, reels] = await Promise.all([
      this.prisma.video.count({ where: { categoryId } }),
      this.prisma.reel.count({ where: { categoryId } }),
    ]);
    return { videos, reels };
  }

  private toDto(
    cat: { id: string; name: string; parentId: string | null; sortOrder: number; createdAt: Date },
    videoCount: number,
    reelCount: number,
  ): CategoryDto {
    return {
      id: cat.id,
      name: cat.name,
      parentId: cat.parentId,
      sortOrder: cat.sortOrder,
      videoCount,
      reelCount,
      children: [],
      createdAt: cat.createdAt.toISOString(),
    };
  }
}
