'use client';

import { motion } from 'framer-motion';
import { useState } from 'react';
import {
  User,
  MoreVertical,
  Shield,
  UserX,
  Mail,
  Key,
  Edit,
  Trash2
} from 'lucide-react';

interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: 'owner' | 'admin' | 'developer' | 'viewer';
  status: 'active' | 'invited' | 'disabled';
  avatar?: string;
  lastActive: Date;
  permissions: string[];
}

interface TeamMembersListProps {
  members: TeamMember[];
  currentUserId: string;
  onInvite?: () => void;
  onEdit?: (member: TeamMember) => void;
  onRemove?: (member: TeamMember) => void;
  onChangeRole?: (member: TeamMember, newRole: string) => void;
}

export function TeamMembersList({
  members,
  currentUserId,
  onInvite,
  onEdit,
  onRemove,
  onChangeRole
}: TeamMembersListProps) {
  const [showActions, setShowActions] = useState<string | null>(null);

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'owner':
        return 'bg-purple-100 text-purple-800';
      case 'admin':
        return 'bg-blue-100 text-blue-800';
      case 'developer':
        return 'bg-green-100 text-green-800';
      case 'viewer':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-500';
      case 'invited':
        return 'bg-yellow-500';
      case 'disabled':
        return 'bg-gray-500';
      default:
        return 'bg-gray-500';
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold">Team Members</h3>
            <p className="text-sm text-gray-600 mt-1">
              {members.length} member{members.length !== 1 ? 's' : ''}
            </p>
          </div>

          <button
            onClick={onInvite}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Invite Member
          </button>
        </div>
      </div>

      <div className="divide-y divide-gray-200">
        {members.map((member) => (
          <motion.div
            key={member.id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="p-4 hover:bg-gray-50"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="relative">
                  {member.avatar ? (
                    <img
                      src={member.avatar}
                      alt={member.name}
                      className="w-10 h-10 rounded-full"
                    />
                  ) : (
                    <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center">
                      <User className="w-5 h-5 text-gray-600" />
                    </div>
                  )}
                  <span
                    className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white ${getStatusColor(
                      member.status
                    )}`}
                  />
                </div>

                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{member.name}</p>
                    {member.id === currentUserId && (
                      <span className="text-xs text-gray-500">(You)</span>
                    )}
                  </div>
                  <p className="text-sm text-gray-600">{member.email}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span
                      className={`px-2 py-0.5 text-xs rounded-full ${getRoleBadgeColor(
                        member.role
                      )}`}
                    >
                      {member.role}
                    </span>
                    {member.status === 'invited' && (
                      <span className="px-2 py-0.5 text-xs rounded-full bg-yellow-100 text-yellow-800">
                        Pending Invite
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="text-right">
                  <p className="text-sm text-gray-500">Last active</p>
                  <p className="text-sm">
                    {new Date(member.lastActive).toLocaleDateString()}
                  </p>
                </div>

                {member.id !== currentUserId && member.role !== 'owner' && (
                  <div className="relative">
                    <button
                      onClick={() =>
                        setShowActions(
                          showActions === member.id ? null : member.id
                        )
                      }
                      className="p-1 text-gray-400 hover:text-gray-600"
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>

                    {showActions === member.id && (
                      <div className="absolute right-0 top-8 w-48 bg-white rounded-lg shadow-lg border border-gray-200 z-10">
                        <button
                          onClick={() => {
                            onEdit?.(member);
                            setShowActions(null);
                          }}
                          className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2"
                        >
                          <Edit className="w-4 h-4" />
                          Edit Permissions
                        </button>
                        <button
                          className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2"
                        >
                          <Key className="w-4 h-4" />
                          Reset Password
                        </button>
                        <button
                          className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2"
                        >
                          <Mail className="w-4 h-4" />
                          Resend Invite
                        </button>
                        <hr className="my-1" />
                        <button
                          onClick={() => {
                            onRemove?.(member);
                            setShowActions(null);
                          }}
                          className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2 text-red-600"
                        >
                          <UserX className="w-4 h-4" />
                          Remove Member
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}