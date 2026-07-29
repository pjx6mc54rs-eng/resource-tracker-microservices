import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
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
  @Roles(UserRole.ADMIN, UserRole.COLLABORATEUR)
  @Get('users')
  async listUsers() {
    const users = await this.usersService.findAll();
    return users.map((u) => this.usersService.sanitize(u));
  }
}
