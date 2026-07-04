import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { SocialAccountDto, SocialPostDto, SocialPlatform } from '@arg/shared';
import { SOCIAL_PLATFORMS } from '@arg/shared';
import { PrismaService } from '../prisma/prisma.service';
import { MapperService } from '../common/mapper.service';
import { PublishingDispatcher } from '../queue/publishing-dispatcher.service';
import { ConnectAccountDto, PublishReelDto } from './dto';

@Injectable()
export class PublishingService {
  private readonly logger = new Logger(PublishingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mapper: MapperService,
    private readonly dispatcher: PublishingDispatcher,
  ) {}

  async listAccounts(): Promise<SocialAccountDto[]> {
    const accounts = await this.prisma.socialAccount.findMany({
      orderBy: { connectedAt: 'desc' },
    });
    return accounts.map((a) => this.mapper.toSocialAccountDto(a));
  }

  /**
   * Connect an account with a token you supply (full browser OAuth needs a public
   * redirect URL + registered app, which isn't feasible locally). For "webhook",
   * `accessToken` is the destination URL.
   */
  async connectAccount(platform: string, dto: ConnectAccountDto): Promise<SocialAccountDto> {
    if (!SOCIAL_PLATFORMS.includes(platform as SocialPlatform)) {
      throw new BadRequestException(`Unknown platform "${platform}"`);
    }
    if (!dto.accessToken?.trim()) throw new BadRequestException('accessToken is required');
    const account = await this.prisma.socialAccount.create({
      data: {
        platform: platform as SocialPlatform,
        displayName: dto.displayName?.trim() || `${platform} account`,
        accessToken: dto.accessToken.trim(),
        refreshToken: dto.refreshToken ?? null,
        platformMeta: (dto.platformMeta ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
    return this.mapper.toSocialAccountDto(account);
  }

  async disconnectAccount(id: string): Promise<void> {
    const account = await this.prisma.socialAccount.findUnique({ where: { id } });
    if (!account) throw new NotFoundException('Account not found');
    await this.prisma.socialAccount.delete({ where: { id } });
  }

  async publish(reelId: string, dto: PublishReelDto): Promise<SocialPostDto[]> {
    const reel = await this.prisma.reel.findUnique({ where: { id: reelId } });
    if (!reel) throw new NotFoundException('Reel not found');
    if (!reel.filePath) throw new BadRequestException('Reel has no rendered file yet');

    const accounts = await this.prisma.socialAccount.findMany({
      where: { id: { in: dto.accountIds } },
    });
    if (accounts.length === 0) throw new BadRequestException('No valid accounts selected');

    const scheduledAt = dto.scheduledAt ? new Date(dto.scheduledAt) : null;
    const delayMs = scheduledAt ? Math.max(0, scheduledAt.getTime() - Date.now()) : 0;

    const posts: SocialPostDto[] = [];
    for (const account of accounts) {
      const post = await this.prisma.socialPost.create({
        data: {
          reelId,
          accountId: account.id,
          platform: account.platform,
          status: 'pending',
          caption: dto.caption ?? reel.suggestedTitle ?? undefined,
          hashtags: dto.hashtags ?? [],
          scheduledAt,
        },
      });
      await this.dispatcher.enqueuePublish(post.id, delayMs);
      posts.push(this.mapper.toSocialPostDto(post));
    }

    this.logger.log(`Queued ${posts.length} publish job(s) for reel ${reelId}`);
    return posts;
  }

  async listReelPosts(reelId: string): Promise<SocialPostDto[]> {
    const posts = await this.prisma.socialPost.findMany({
      where: { reelId },
      orderBy: { createdAt: 'desc' },
    });
    return posts.map((p) => this.mapper.toSocialPostDto(p));
  }

  async retryPost(postId: string): Promise<SocialPostDto> {
    const post = await this.prisma.socialPost.findUnique({ where: { id: postId } });
    if (!post) throw new NotFoundException('Post not found');
    if (post.status === 'published') throw new BadRequestException('Post is already published');
    await this.prisma.socialPost.update({
      where: { id: postId },
      data: { status: 'pending', error: null },
    });
    await this.dispatcher.enqueuePublish(postId);
    const updated = await this.prisma.socialPost.findUniqueOrThrow({ where: { id: postId } });
    return this.mapper.toSocialPostDto(updated);
  }

  async removePost(postId: string): Promise<void> {
    const post = await this.prisma.socialPost.findUnique({ where: { id: postId } });
    if (!post) throw new NotFoundException('Post not found');
    await this.prisma.socialPost.delete({ where: { id: postId } });
  }
}
