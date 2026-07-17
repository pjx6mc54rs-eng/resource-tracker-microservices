
import { Injectable, OnModuleInit } from '@nestjs/common';
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

  create(data: Partial<User>): Promise<User> {
    if (data.email) {
      data.email = data.email.trim().toLowerCase();
    }
    const user = this.usersRepository.create(data);
    return this.usersRepository.save(user);
  }

  async update(id: string, data: Partial<User>): Promise<User> {
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
    return safe;
  }
}
