import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getInitials, formatDateTime } from '@/lib/utils';

const recentActivities = [
  {
    id: 1,
    user: {
      name: 'John Doe',
      email: 'john@example.com',
      avatar: 'https://cdn.discordapp.com/embed/avatars/0.png',
    },
    action: 'Activated license',
    licenseKey: 'XXXX-XXXX-XXXX',
    timestamp: new Date(Date.now() - 1000 * 60 * 5), // 5 minutes ago
  },
  {
    id: 2,
    user: {
      name: 'Jane Smith',
      email: 'jane@example.com',
      avatar: 'https://cdn.discordapp.com/embed/avatars/1.png',
    },
    action: 'Created license',
    licenseKey: 'YYYY-YYYY-YYYY',
    timestamp: new Date(Date.now() - 1000 * 60 * 15), // 15 minutes ago
  },
  {
    id: 3,
    user: {
      name: 'Bob Johnson',
      email: 'bob@example.com',
      avatar: 'https://cdn.discordapp.com/embed/avatars/2.png',
    },
    action: 'Transferred license',
    licenseKey: 'ZZZZ-ZZZZ-ZZZZ',
    timestamp: new Date(Date.now() - 1000 * 60 * 30), // 30 minutes ago
  },
  {
    id: 4,
    user: {
      name: 'Alice Brown',
      email: 'alice@example.com',
      avatar: 'https://cdn.discordapp.com/embed/avatars/3.png',
    },
    action: 'Revoked license',
    licenseKey: 'AAAA-AAAA-AAAA',
    timestamp: new Date(Date.now() - 1000 * 60 * 45), // 45 minutes ago
  },
  {
    id: 5,
    user: {
      name: 'Charlie Wilson',
      email: 'charlie@example.com',
      avatar: 'https://cdn.discordapp.com/embed/avatars/4.png',
    },
    action: 'Activated license',
    licenseKey: 'BBBB-BBBB-BBBB',
    timestamp: new Date(Date.now() - 1000 * 60 * 60), // 1 hour ago
  },
];

export function RecentActivity() {
  return (
    <div className="space-y-8">
      {recentActivities.map((activity) => (
        <div key={activity.id} className="flex items-center">
          <Avatar className="h-9 w-9">
            <AvatarImage src={activity.user.avatar} alt={activity.user.name} />
            <AvatarFallback>{getInitials(activity.user.name)}</AvatarFallback>
          </Avatar>
          <div className="ml-4 space-y-1 flex-1">
            <p className="text-sm font-medium leading-none">
              {activity.user.name}
            </p>
            <p className="text-sm text-muted-foreground">
              {activity.action} • {activity.licenseKey}
            </p>
          </div>
          <div className="text-sm text-muted-foreground">
            {formatDateTime(activity.timestamp)}
          </div>
        </div>
      ))}
    </div>
  );
}