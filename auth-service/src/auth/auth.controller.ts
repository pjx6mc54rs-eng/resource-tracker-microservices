import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { writeFileSync, existsSync, mkdirSync, unlinkSync } from 'fs';
import { join, extname, basename } from 'path';
import { randomUUID } from 'crypto';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { Roles } from './decorators/roles.decorator';
import { UserRole } from '../entities/user.entity';
import { EventsService } from '../events/events.service';

interface AuthenticatedRequest {
  user: { userId: string; email: string; role: UserRole };
}

const AVATAR_MAX_SIZE = 5 * 1024 * 1024;
const AVATAR_MIME_EXTENSIONS: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

const avatarUploadOptions = {
  limits: { fileSize: AVATAR_MAX_SIZE },
  fileFilter: (
    _req: unknown,
    file: { mimetype: string },
    cb: (error: Error | null, acceptFile: boolean) => void,
  ) => {
    if (AVATAR_MIME_EXTENSIONS[file.mimetype]) {
      cb(null, true);
    } else {
      cb(
        new BadRequestException('Only PNG, JPEG, WebP or GIF images are allowed'),
        false,
      );
    }
  },
};

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
    private readonly events: EventsService,
  ) {}

  private saveAvatarFile(file: any): string {
    const uploadDir = join(process.cwd(), 'uploads');
    if (!existsSync(uploadDir)) {
      mkdirSync(uploadDir, { recursive: true });
    }
    const fileExt =
      AVATAR_MIME_EXTENSIONS[file.mimetype] ?? extname(file.originalname);
    const fileName = `${randomUUID()}${fileExt}`;
    writeFileSync(join(uploadDir, fileName), file.buffer);
    return `/api/auth/uploads/${fileName}`;
  }

  private deleteAvatarFile(avatarUrl: string | null | undefined): void {
    if (!avatarUrl) return;
    // basename() neutralise toute tentative de path traversal
    const filePath = join(process.cwd(), 'uploads', basename(avatarUrl));
    try {
      if (existsSync(filePath)) {
        unlinkSync(filePath);
      }
    } catch {
      // un fichier orphelin ne doit pas faire échouer la mise à jour du profil
    }
  }

  @Post('register')
  @UseInterceptors(FileInterceptor('avatar', avatarUploadOptions))
  async register(
    @Body() dto: RegisterDto,
    @UploadedFile() file?: any,
  ) {
    let avatarUrl: string | undefined = undefined;
    if (file) {
      avatarUrl = this.saveAvatarFile(file);
    }

    return this.authService.register({
      ...dto,
      ...(avatarUrl && { avatarUrl }),
    });
  }

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@Req() req: AuthenticatedRequest) {
    return this.authService.getProfile(req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('me')
  updateMe(@Req() req: AuthenticatedRequest, @Body() dto: UpdateProfileDto) {
    return this.authService.updateProfile(req.user.userId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('me/password')
  changePassword(
    @Req() req: AuthenticatedRequest,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.authService.changePassword(req.user.userId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('me/avatar')
  @UseInterceptors(FileInterceptor('avatar', avatarUploadOptions))
  async updateAvatar(
    @Req() req: AuthenticatedRequest,
    @UploadedFile() file?: any,
  ) {
    if (!file) {
      throw new BadRequestException('No image file provided');
    }
    const current = await this.authService.getProfile(req.user.userId);
    const avatarUrl = this.saveAvatarFile(file);
    const updated = await this.authService.setAvatar(req.user.userId, avatarUrl);
    this.deleteAvatarFile(current.avatarUrl);
    return updated;
  }

  @UseGuards(JwtAuthGuard)
  @Delete('me/avatar')
  async deleteAvatar(@Req() req: AuthenticatedRequest) {
    const current = await this.authService.getProfile(req.user.userId);
    const updated = await this.authService.setAvatar(req.user.userId, null);
    this.deleteAvatarFile(current.avatarUrl);
    return updated;
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.COLLABORATEUR, UserRole.RESPONSABLE)
  @Get('users')
  async listUsers() {
    const users = await this.usersService.findAll();
    return users.map((u) => this.usersService.sanitize(u));
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Patch('users/:id/role')
  async updateUserRole(
    @Param('id') userId: string,
    @Body() body: { role?: UserRole; roles?: UserRole[] },
  ) {
    const roles = Array.isArray(body.roles)
      ? body.roles.filter((r) => Object.values(UserRole).includes(r))
      : (body.role ? [body.role] : []);

    if (roles.length === 0) {
      throw new BadRequestException('Au moins un rôle valide est requis');
    }
    const updated = await this.usersService.update(userId, { roles });

    this.events.emit('account.role_changed', {
      recipientIds: [userId],
      newRole: this.usersService.sanitize(updated).role,
    });

    return this.usersService.sanitize(updated);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Patch('users/:id')
  async adminUpdateUser(
    @Param('id') userId: string,
    @Body() body: {
      firstName?: string;
      lastName?: string;
      phone?: string;
      jobTitle?: string;
      bio?: string;
      roles?: UserRole[];
      role?: UserRole;
      responsableIds?: string[];
      newPassword?: string;
    },
  ) {
    const existing = await this.usersService.findById(userId);
    if (!existing) {
      throw new NotFoundException('Utilisateur introuvable');
    }

    let roles: UserRole[] = existing.roles && existing.roles.length > 0
      ? existing.roles
      : [existing.role || UserRole.COLLABORATEUR];

    if (Array.isArray(body.roles) && body.roles.length > 0) {
      roles = body.roles.filter((r) => Object.values(UserRole).includes(r));
    } else if (body.role && Object.values(UserRole).includes(body.role)) {
      roles = [body.role];
    }

    let responsableIds: string[] | undefined = undefined;
    if (Array.isArray(body.responsableIds)) {
      responsableIds = await this.usersService.validateResponsables(
        userId,
        body.responsableIds,
        roles,
      );
    } else if ((body.responsableIds as any) === null) {
      responsableIds = await this.usersService.validateResponsables(
        userId,
        [],
        roles,
      );
    } else {
      const existingIds = existing.responsableIds || [];
      responsableIds = await this.usersService.validateResponsables(
        userId,
        existingIds,
        roles,
      );
    }

    let passwordHash: string | undefined = undefined;
    if (body.newPassword && body.newPassword.trim().length > 0) {
      if (body.newPassword.trim().length < 6) {
        throw new BadRequestException('Le mot de passe doit contenir au moins 6 caractères');
      }
      passwordHash = await bcrypt.hash(body.newPassword.trim(), 10);
    }

    const updated = await this.usersService.update(userId, {
      ...(body.firstName !== undefined && { firstName: body.firstName }),
      ...(body.lastName !== undefined && { lastName: body.lastName }),
      ...(body.phone !== undefined && { phone: body.phone }),
      ...(body.jobTitle !== undefined && { jobTitle: body.jobTitle }),
      ...(body.bio !== undefined && { bio: body.bio }),
      ...(roles !== undefined && roles.length > 0 && { roles }),
      ...(responsableIds !== undefined && { responsableIds }),
      ...(passwordHash !== undefined && { passwordHash }),
    });

    // Notifier uniquement les responsables reellement ajoutes : une mise a jour
    // de profil qui laisse la hierarchie inchangee ne doit rien declencher.
    const before = existing.responsableIds || [];
    const after = updated.responsableIds || [];
    const added = after.filter((id) => !before.includes(id));

    if (added.length > 0) {
      const managers = await Promise.all(
        added.map((id) => this.usersService.findById(id)),
      );
      const managerNames = managers
        .filter(Boolean)
        .map((m) =>
          [m!.firstName, m!.lastName].filter(Boolean).join(' ').trim() || m!.email,
        );

      // Le collaborateur apprend qui est son nouveau responsable.
      this.events.emit('responsable.assigned', {
        recipientIds: [userId],
        managerNames,
      });

      // Et chaque responsable apprend qui lui est rattache.
      const collaboratorName =
        [updated.firstName, updated.lastName].filter(Boolean).join(' ').trim() ||
        updated.email;
      this.events.emit('collaborator.attached', {
        recipientIds: added,
        collaboratorName,
      });
    }

    return this.usersService.sanitize(updated);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Patch('users/:id/password')
  async adminChangePassword(
    @Param('id') userId: string,
    @Body() body: { newPassword?: string },
  ) {
    if (!body.newPassword || body.newPassword.trim().length < 6) {
      throw new BadRequestException('Le mot de passe doit contenir au moins 6 caractères');
    }
    const updated = await this.usersService.adminChangePassword(userId, body.newPassword);
    return this.usersService.sanitize(updated);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Patch('users/:id/avatar')
  @UseInterceptors(FileInterceptor('avatar', avatarUploadOptions))
  async adminUpdateAvatar(
    @Param('id') userId: string,
    @UploadedFile() file?: any,
  ) {
    if (!file) {
      throw new BadRequestException('No image file provided');
    }
    const current = await this.authService.getProfile(userId);
    const avatarUrl = this.saveAvatarFile(file);
    const updated = await this.authService.setAvatar(userId, avatarUrl);
    this.deleteAvatarFile(current.avatarUrl);
    return updated;
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Delete('users/:id/avatar')
  async adminDeleteAvatar(@Param('id') userId: string) {
    const current = await this.authService.getProfile(userId);
    const updated = await this.authService.setAvatar(userId, null);
    this.deleteAvatarFile(current.avatarUrl);
    return updated;
  }
}
