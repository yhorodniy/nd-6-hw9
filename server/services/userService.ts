import { supabase } from './supabase';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { ValidationError, AuthServiceError } from '../helpers/errors';
import { LoginResponse, UserCreateRequest } from '../types/types';

export class UserService {
    private static readonly SALT_ROUNDS = 10;
    private static readonly JWT_SECRET = process.env.JWT_SECRET || '1234567890abcdef';
    private static readonly JWT_EXPIRES_IN = '7d';

    static async createUser(userData: UserCreateRequest): Promise<LoginResponse> {
        // Перевіряємо, чи користувач вже існує
        const { data: existingUser } = await supabase
            .from('users')
            .select('id')
            .eq('email', userData.email)
            .single();

        if (existingUser) {
            throw new AuthServiceError('User with this email already exists', 409);
        }

        // Хешуємо пароль
        const passwordHash = await bcrypt.hash(userData.password, this.SALT_ROUNDS);

        // Створюємо користувача
        const { data, error } = await supabase
            .from('users')
            .insert([{
                email: userData.email,
                password_hash: passwordHash
            }])
            .select('id, email')
            .single();

        if (error) {
            throw new AuthServiceError(`Failed to create user: ${error.message}`, 500, error);
        }

        // Генеруємо JWT токен
        const token = jwt.sign(
            { 
                userId: data.id, 
                email: data.email 
            },
            this.JWT_SECRET,
            { expiresIn: this.JWT_EXPIRES_IN }
        );

        return {
            token: `Bearer ${token}`,
            user: {
                id: data.id,
                email: data.email
            }
        };
    }

    static async loginUser(email: string, password: string): Promise<LoginResponse> {
        // Знаходимо користувача за email
        const { data: user, error } = await supabase
            .from('users')
            .select('id, email, password_hash')
            .eq('email', email)
            .single();

        if (error || !user) {
            throw new AuthServiceError('Invalid email or password', 401);
        }

        // Перевіряємо пароль
        const isValidPassword = await bcrypt.compare(password, user.password_hash);
        if (!isValidPassword) {
            throw new AuthServiceError('Invalid email or password', 401);
        }

        // Генеруємо JWT токен
        const token = jwt.sign(
            { 
                userId: user.id, 
                email: user.email 
            },
            this.JWT_SECRET,
            { expiresIn: this.JWT_EXPIRES_IN }
        );

        return {
            token: `Bearer ${token}`,
            user: {
                id: user.id,
                email: user.email
            }
        };
    }

    static async getUserById(id: string): Promise<{ id: string; email: string } | null> {
        const { data, error } = await supabase
            .from('users')
            .select('id, email')
            .eq('id', id)
            .single();

        if (error || !data) {
            return null;
        }

        return {
            id: data.id,
            email: data.email
        };
    }

    static async updateUser(id: string, updateData: { email?: string; password?: string }): Promise<{ id: string; email: string }> {
        const updates: any = {};

        if (updateData.email) {
            // Перевіряємо, чи email не зайнятий іншим користувачем
            const { data: existingUser } = await supabase
                .from('users')
                .select('id')
                .eq('email', updateData.email)
                .neq('id', id)
                .single();

            if (existingUser) {
                throw new AuthServiceError('Email already in use', 409);
            }

            updates.email = updateData.email;
        }

        if (updateData.password) {
            updates.password_hash = await bcrypt.hash(updateData.password, this.SALT_ROUNDS);
        }

        if (Object.keys(updates).length === 0) {
            throw new ValidationError('No data to update');
        }

        const { data, error } = await supabase
            .from('users')
            .update(updates)
            .eq('id', id)
            .select('id, email')
            .single();

        if (error) {
            throw new AuthServiceError(`Failed to update user: ${error.message}`, 500, error);
        }

        return {
            id: data.id,
            email: data.email
        };
    }

    static async deleteUser(id: string): Promise<void> {
        const { error } = await supabase
            .from('users')
            .delete()
            .eq('id', id);

        if (error) {
            throw new AuthServiceError(`Failed to delete user: ${error.message}`, 500, error);
        }
    }
}
