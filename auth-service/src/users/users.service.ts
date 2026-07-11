import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './user.entity';

@Injectable()
export class UsersService {
    constructor(
        @InjectRepository(User)
        private readonly usersRepository: Repository<User>,
    ) { }

    findByEmail(email: string): Promise<User | null> {
        return this.usersRepository.findOne({ where: { email } });
    }

    findById(id: string): Promise<User | null> {
        return this.usersRepository.findOne({ where: { id } });
    }

    findAll(): Promise<User[]> {
        return this.usersRepository.find();
    }

    create(data: Partial<User>): Promise<User> {
        const user = this.usersRepository.create(data);
        return this.usersRepository.save(user);
    }

    // Retire systématiquement le password_hash avant de renvoyer un utilisateur au client.
    sanitize(user: User): Omit<User, 'password_hash'> {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { password_hash, ...safe } = user;
        return safe;
    }
}