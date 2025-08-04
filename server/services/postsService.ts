import { PaginatedResponse, Post, PostCreateRequest, PostUpdateRequest } from '../types/types';
import { supabase } from './supabase';

export class PostsService {
    private static createSlug(title: string): string {
        return title
            .toLowerCase()
            .replace(/['\"""'']/g, '')
            .replace(/[^a-zа-яё0-9\s-]/g, '')
            .replace(/\s+/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '');
    }

    private static calculateReadingTime(content: string): number {
        const wordsPerMinute = 200;
        const words = content.split(/\s+/).length;
        return Math.ceil(words / wordsPerMinute);
    }
    static async getAllPosts(
        page: number = 0,
        size: number = 10,
        category?: string,
        userId?: string
    ): Promise<PaginatedResponse<Post>> {
        let query = supabase
            .from('posts')
            .select('*', { count: 'exact' })
            .order('created_at', { ascending: false });

        if (userId) {
            query = query.or(`is_published.eq.true,and(is_published.eq.false,author_id.eq.${userId})`);
        } else {
            query = query.eq('is_published', true);
        }

        if (category) {
            query = query.eq('category', category);
        }

        const from = page * size;
        const to = from + size - 1;

        const { data, error, count } = await query.range(from, to);

        if (error) {
            throw new Error(`Failed to fetch posts: ${error.message}`);
        }

        const total = count || 0;
        const totalPages = Math.ceil(total / size);

        return {
            data: data || [],
            pagination: {
                page,
                size,
                total,
                totalPages
            }
        };
    }

    static async getPostById(id: string, userId?: string): Promise<Post> {
        let query = supabase
            .from('posts')
            .select('*')
            .eq('id', id);

        const { data, error } = await query.single();

        if (error) {
            throw new Error(`Failed to fetch post: ${error.message}`);
        }

        if (!data) {
            throw new Error('Post not found');
        }

        if (!data.is_published && data.author_id !== userId) {
            throw new Error('Post not found or not accessible');
        }

        if (data.is_published) {
            await supabase
                .from('posts')
                .update({ views_count: (data.views_count || 0) + 1 })
                .eq('id', id);
            
            data.views_count = (data.views_count || 0) + 1;
        }

        return data;
    }

    static async createPost(postData: PostCreateRequest, authorId: string): Promise<Post> {
        const slug = this.createSlug(postData.title);
        const readingTime = this.calculateReadingTime(postData.content);
        
        const { data, error } = await supabase
            .from('posts')
            .insert([{
                ...postData,
                author_id: authorId,
                slug,
                reading_time: readingTime,
                is_published: postData.is_published ?? true,
                is_featured: postData.is_featured ?? false,
                views_count: 0,
                likes_count: 0
            }])
            .select()
            .single();

        if (error) {
            throw new Error(`Failed to create post: ${error.message}`);
        }

        return data;
    }

    static async updatePost(id: string, postData: PostUpdateRequest, authorId: string): Promise<Post> {
        const { data: existingPost, error: fetchError } = await supabase
            .from('posts')
            .select('author_id, title, content')
            .eq('id', id)
            .single();

        if (fetchError) {
            throw new Error(`Failed to fetch post: ${fetchError.message}`);
        }

        if (!existingPost) {
            throw new Error('Post not found');
        }

        if (existingPost.author_id !== authorId) {
            throw new Error('Unauthorized: You can only update your own posts');
        }

        const updateData: any = { ...postData };
        if (postData.title && postData.title !== existingPost.title) {
            updateData.slug = this.createSlug(postData.title);
        }

        if (postData.content && postData.content !== existingPost.content) {
            updateData.reading_time = this.calculateReadingTime(postData.content);
        }

        const { data, error } = await supabase
            .from('posts')
            .update(updateData)
            .eq('id', id)
            .select()
            .single();

        if (error) {
            throw new Error(`Failed to update post: ${error.message}`);
        }

        return data;
    }

    static async deletePost(id: string, authorId: string): Promise<void> {
        const { data: existingPost, error: fetchError } = await supabase
            .from('posts')
            .select('author_id')
            .eq('id', id)
            .single();

        if (fetchError) {
            throw new Error(`Failed to fetch post: ${fetchError.message}`);
        }

        if (!existingPost) {
            throw new Error('Post not found');
        }

        if (existingPost.author_id !== authorId) {
            throw new Error('Unauthorized: You can only delete your own posts');
        }

        const { error } = await supabase
            .from('posts')
            .delete()
            .eq('id', id);

        if (error) {
            throw new Error(`Failed to delete post: ${error.message}`);
        }
    }

    static async getCategories(): Promise<string[]> {
        const { data, error } = await supabase
            .from('categories')
            .select('*', { count: 'exact' })
            .order('name', { ascending: true });

        if (error) {
            throw new Error(`Failed to fetch categories: ${error.message}`);
        }
        return data;
    }
}
