'use client';
import { useState } from 'react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Textarea from '@/components/ui/Textarea';
import Modal from '@/components/ui/Modal';
import Badge from '@/components/ui/Badge';
import { Plus, Trash2, Eye, EyeOff, Newspaper } from 'lucide-react';
import { formatDateShort } from '@/lib/utils';
import toast from 'react-hot-toast';
import type { BlogPost } from '@/lib/db/types';

type Post = BlogPost;

interface BlogClientProps {
  initialPosts: BlogPost[];
}

export default function BlogClient({ initialPosts }: BlogClientProps) {
  const [posts, setPosts] = useState(initialPosts);
  const [isOpen, setIsOpen] = useState(false);
  const [form, setForm] = useState({ title: '', excerpt: '', content: '', category: '', thumbnail: '', authorName: '', readTime: '5 min read' });

  const createPost = () => {
    if (!form.title.trim()) { toast.error('Title required'); return; }
    const post: Post = {
      id: Date.now().toString(),
      slug: form.title.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
      ...form,
      tags: [],
      authorId: 'admin-1',
      publishedAt: new Date().toISOString().split('T')[0],
      isPublished: true,
    };
    setPosts(p => [post, ...p]);
    toast.success('Post published!');
    setIsOpen(false);
    setForm({ title: '', excerpt: '', content: '', category: '', thumbnail: '', authorName: '', readTime: '5 min read' });
  };

  const togglePublish = (id: string) => {
    setPosts(ps => ps.map(p => p.id === id ? { ...p, isPublished: !p.isPublished } : p));
    toast.success('Post status updated');
  };

  const deletePost = (id: string) => {
    setPosts(ps => ps.filter(p => p.id !== id));
    toast.success('Post deleted');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-white">Blog / Articles</h1>
          <p className="text-muted text-sm mt-1">{posts.length} article{posts.length !== 1 ? 's' : ''}</p>
        </div>
        <Button onClick={() => setIsOpen(true)}><Plus className="w-4 h-4" />New Article</Button>
      </div>

      <div className="bg-dark-card border border-dark-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-dark-border bg-dark-border/20">
                {['Article', 'Category', 'Author', 'Date', 'Status', 'Actions'].map(h => (
                  <th key={h} className="text-left text-muted text-xs py-3 px-4 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {posts.map(post => (
                <tr key={post.id} className="border-b border-dark-border/40 last:border-0 hover:bg-dark-border/10">
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      {post.thumbnail && <img src={post.thumbnail} alt="" className="w-10 h-10 rounded-lg object-cover" />}
                      <span className="text-white text-xs font-medium max-w-[160px] truncate">{post.title}</span>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-muted text-xs">{post.category}</td>
                  <td className="py-3 px-4 text-muted text-xs">{post.authorName}</td>
                  <td className="py-3 px-4 text-muted text-xs">{formatDateShort(post.publishedAt)}</td>
                  <td className="py-3 px-4"><Badge variant={post.isPublished ? 'success' : 'muted'}>{post.isPublished ? 'Published' : 'Draft'}</Badge></td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-1">
                      <button onClick={() => togglePublish(post.id)} className="text-muted hover:text-primary p-1 cursor-pointer">
                        {post.isPublished ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                      <button onClick={() => deletePost(post.id)} className="text-muted hover:text-red-400 p-1 cursor-pointer"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal isOpen={isOpen} onClose={() => setIsOpen(false)} title="New Article" size="lg">
        <div className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <Input label="Title" placeholder="Article title" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
            <Input label="Category" placeholder="e.g., React, Python" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} />
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <Input label="Author Name" placeholder="Instructor name" value={form.authorName} onChange={e => setForm(f => ({ ...f, authorName: e.target.value }))} />
            <Input label="Read Time" placeholder="e.g., 5 min read" value={form.readTime} onChange={e => setForm(f => ({ ...f, readTime: e.target.value }))} />
          </div>
          <Input label="Thumbnail URL" placeholder="https://..." value={form.thumbnail} onChange={e => setForm(f => ({ ...f, thumbnail: e.target.value }))} />
          <Textarea label="Excerpt" placeholder="Brief summary shown in listings" value={form.excerpt} onChange={e => setForm(f => ({ ...f, excerpt: e.target.value }))} rows={2} />
          <Textarea label="Content" placeholder="Full article content..." value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))} rows={6} />
          <div className="flex gap-3">
            <Button variant="secondary" fullWidth onClick={() => setIsOpen(false)}>Cancel</Button>
            <Button fullWidth onClick={createPost}>Publish Article</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
