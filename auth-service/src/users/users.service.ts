
import { Injectable, OnModuleInit, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserRole } from '../entities/user.entity';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService implements OnModuleInit {
  constructor(
      @InjectRepository(User)
      private readonly usersRepository: Repository<User>,
  ) {}

  async onModuleInit() {
    await this.seedAdminUser();
  }

  async seedAdminUser() {
    const adminEmail = process.env.DEFAULT_ADMIN_EMAIL || 'admin@admin.com';
    const adminPassword = process.env.DEFAULT_ADMIN_PASSWORD || 'admin';

    // Check if any admin exists in the database
    const adminCount = await this.usersRepository.count({
      where: { role: UserRole.ADMIN },
    });

    if (adminCount === 0) {
      const passwordHash = await bcrypt.hash(adminPassword, 10);
      await this.create({
        email: adminEmail,
        passwordHash,
        role: UserRole.ADMIN,
        roles: [UserRole.ADMIN],
        firstName: 'Admin',
        lastName: 'System',
      });
      console.log(`✅ Default admin user created: ${adminEmail}`);
    }
  }

  findByEmail(email: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { email: email.trim().toLowerCase() } });
  }

  findById(id: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { id } });
  }

  findAll(): Promise<User[]> {
    return this.usersRepository.find();
  }

  async isUserInManagerChain(startUserId: string, targetUserId: string, visited = new Set<string>()): Promise<boolean> {
    if (!startUserId || visited.has(startUserId)) return false;
    visited.add(startUserId);

    const user = await this.findById(startUserId);
    if (!user || !Array.isArray(user.responsableIds) || user.responsableIds.length === 0) {
      return false;
    }

    if (user.responsableIds.includes(targetUserId)) {
      return true;
    }

    for (const managerId of user.responsableIds) {
      const found = await this.isUserInManagerChain(managerId, targetUserId, visited);
      if (found) return true;
    }

    return false;
  }

  async validateResponsables(
    targetUserId: string | null,
    proposedResponsableIds: string[],
    targetRoles: UserRole[],
  ): Promise<string[]> {
    const uniqueIds = Array.from(new Set(proposedResponsableIds.filter(Boolean)));

    if (targetUserId && uniqueIds.includes(targetUserId)) {
      throw new BadRequestException('Un utilisateur ne peut pas être son propre responsable.');
    }

    const isWorker = targetRoles.includes(UserRole.COLLABORATEUR) || targetRoles.includes(UserRole.RESPONSABLE);
    if (isWorker && uniqueIds.length === 0) {
      throw new BadRequestException('Chaque collaborateur ou responsable doit avoir au moins un responsable désigné.');
    }

    for (const managerId of uniqueIds) {
      const manager = await this.findById(managerId);
      if (!manager) {
        throw new BadRequestException(`Responsable introuvable (${managerId})`);
      }

      const managerRoles = Array.isArray(manager.roles) && manager.roles.length > 0
        ? manager.roles
        : [manager.role || UserRole.COLLABORATEUR];

      const isEligibleManager = managerRoles.includes(UserRole.RESPONSABLE) || managerRoles.includes(UserRole.ADMIN);
      if (!isEligibleManager) {
        throw new BadRequestException(`L'utilisateur ${manager.email} n'a pas le rôle de responsable ou d'administrateur.`);
      }

      if (targetUserId) {
        const causesCycle = await this.isUserInManagerChain(managerId, targetUserId);
        if (causesCycle) {
          throw new BadRequestException(`Responsabilité mutuelle interdite : ${manager.email} a déjà cet utilisateur dans sa chaîne de responsables.`);
        }
      }
    }

    return uniqueIds;
  }

  create(data: Partial<User>): Promise<User> {
    if (data.email) {
      data.email = data.email.trim().toLowerCase();
    }
    if (data.roles && data.roles.length > 0) {
      data.role = data.roles.includes(UserRole.ADMIN) ? UserRole.ADMIN : data.roles[0];
    } else if (data.role) {
      data.roles = [data.role];
    }
    const user = this.usersRepository.create(data);
    return this.usersRepository.save(user);
  }

  async adminChangePassword(id: string, newPassword: string): Promise<User> {
    if (!newPassword || newPassword.trim().length < 6) {
      throw new BadRequestException('Le mot de passe doit contenir au moins 6 caractères');
    }
    const passwordHash = await bcrypt.hash(newPassword.trim(), 10);
    return this.update(id, { passwordHash });
  }

  async update(id: string, data: Partial<User>): Promise<User> {
    if (data.roles && data.roles.length > 0) {
      data.role = data.roles.includes(UserRole.ADMIN) ? UserRole.ADMIN : data.roles[0];
    } else if (data.role && (!data.roles || data.roles.length === 0)) {
      data.roles = [data.role];
    }
    await this.usersRepository.update(id, data);
    const user = await this.findById(id);
    if (!user) {
      throw new Error(`User ${id} not found after update`);
    }
    return user;
  }

  sanitize(user: User): Omit<User, 'passwordHash'> {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { passwordHash, ...safe } = user;
    const rolesList = Array.isArray(safe.roles) && safe.roles.length > 0
      ? safe.roles
      : [safe.role || UserRole.COLLABORATEUR];
    const primaryRole = rolesList.includes(UserRole.ADMIN)
      ? UserRole.ADMIN
      : rolesList[0];
    return {
      ...safe,
      roles: rolesList,
      role: primaryRole,
      responsableIds: Array.isArray(safe.responsableIds) ? safe.responsableIds : [],
    };
  }
}
