export function formatPrice(price: number): string {
  if (price === 0) return 'Free';
  return `PKR ${price.toLocaleString()}`;
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-PK', { year: 'numeric', month: 'long', day: 'numeric' });
}

export function formatDateShort(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-PK', { year: 'numeric', month: 'short', day: 'numeric' });
}

export function cn(...classes: (string | undefined | false | null)[]): string {
  return classes.filter(Boolean).join(' ');
}

export function getLevelColor(level: string): string {
  switch (level) {
    case 'beginner': return 'text-green-400 bg-green-400/10';
    case 'intermediate': return 'text-blue-400 bg-blue-400/10';
    case 'advanced': return 'text-red-400 bg-red-400/10';
    default: return 'text-gray-400 bg-gray-400/10';
  }
}

export function getCategoryColor(category: string): string {
  const colors: Record<string, string> = {
    'Web Development': 'text-blue-400 bg-blue-400/10',
    'Mobile Development': 'text-purple-400 bg-purple-400/10',
    'Data Science': 'text-green-400 bg-green-400/10',
    'UI/UX Design': 'text-pink-400 bg-pink-400/10',
    'DevOps': 'text-orange-400 bg-orange-400/10',
    'Programming': 'text-cyan-400 bg-cyan-400/10',
  };
  return colors[category] || 'text-gray-400 bg-gray-400/10';
}

export function generateCertificateNumber(): string {
  return `CB-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 9000) + 1000)}`;
}

export function getTotalLessonsCount(modules: { lessons: unknown[] }[]): number {
  return modules.reduce((total, mod) => total + mod.lessons.length, 0);
}

export function getCourseDuration(modules: { lessons: { duration: string }[] }[]): string {
  let totalMinutes = 0;
  modules.forEach(mod => {
    mod.lessons.forEach(lesson => {
      const match = lesson.duration.match(/(\d+)/);
      if (match) totalMinutes += parseInt(match[1]);
    });
  });
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

export function truncate(str: string, length: number): string {
  if (str.length <= length) return str;
  return str.slice(0, length) + '...';
}
