import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Switch } from '../components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import { Plus, Trash2, Edit, Users, Wifi, Clock, Settings } from 'lucide-react';
import toast from 'react-hot-toast';

interface SubUser {
  id: string;
  token_id: string;
  username: string;
  password: string;
  traffic_limit_gb: number;
  traffic_used_gb: number;
  time_limit_days: number;
  created_at: string;
  expires_at: string | null;
  is_active: boolean;
  is_online: boolean;
  panel_settings: {
    inbound_id: number;
    flow: string;
    security: string;
  };
  xui_user_id: number | null;
}

interface Token {
  id: string;
  name: string;
  panel_url: string;
}

export default function SubUsers() {
  const queryClient = useQueryClient();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [selectedToken, setSelectedToken] = useState<string>('');
  const [newUser, setNewUser] = useState({
    username: '',
    password: '',
    traffic_limit_gb: 0,
    time_limit_days: 30,
    inbound_id: 0,
    flow: '',
    security: 'none',
  });

  // دریافت توکن‌های کاربر
  const { data: tokens } = useQuery({
    queryKey: ['tokens'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tokens')
        .select('id, name, panel_url')
        .eq('user_id', (await supabase.auth.getUser()).data.user?.id);
      if (error) throw error;
      return data as Token[];
    },
  });

  // دریافت کاربران زیرمجموعه
  const { data: subUsers, isLoading } = useQuery({
    queryKey: ['subUsers', selectedToken],
    queryFn: async () => {
      if (!selectedToken) return [];
      const { data, error } = await supabase
        .from('sub_users')
        .select('*')
        .eq('token_id', selectedToken)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as SubUser[];
    },
    enabled: !!selectedToken,
  });

  // افزودن کاربر جدید
  const addMutation = useMutation({
    mutationFn: async (userData: typeof newUser & { token_id: string }) => {
      const { data, error } = await supabase
        .from('sub_users')
        .insert([{
          token_id: userData.token_id,
          username: userData.username,
          password: userData.password,
          traffic_limit_gb: userData.traffic_limit_gb,
          time_limit_days: userData.time_limit_days,
          panel_settings: {
            inbound_id: userData.inbound_id,
            flow: userData.flow,
            security: userData.security,
          },
          expires_at: userData.time_limit_days > 0 
            ? new Date(Date.now() + userData.time_limit_days * 24 * 60 * 60 * 1000).toISOString()
            : null,
        }])
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subUsers'] });
      setIsAddDialogOpen(false);
      setNewUser({
        username: '',
        password: '',
        traffic_limit_gb: 0,
        time_limit_days: 30,
        inbound_id: 0,
        flow: '',
        security: 'none',
      });
      toast.success('کاربر با موفقیت افزوده شد');
    },
    onError: (error: any) => {
      toast.error(`خطا: ${error.message}`);
    },
  });

  // حذف کاربر
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('sub_users')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subUsers'] });
      toast.success('کاربر حذف شد');
    },
    onError: (error: any) => {
      toast.error(`خطا: ${error.message}`);
    },
  });

  // تغییر وضعیت فعال/غیرفعال
  const toggleStatusMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from('sub_users')
        .update({ is_active })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subUsers'] });
      toast.success('وضعیت کاربر به‌روزرسانی شد');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedToken) {
      toast.error('لطفاً یک توکن انتخاب کنید');
      return;
    }
    addMutation.mutate({ ...newUser, token_id: selectedToken });
  };

  const getTrafficProgress = (used: number, limit: number) => {
    if (limit === 0) return 100;
    return Math.min((used / limit) * 100, 100);
  };

  const formatTraffic = (gb: number) => {
    if (gb === 0) return 'نامحدود';
    return `${gb.toFixed(1)} گیگابایت`;
  };

  const isExpired = (expiresAt: string | null) => {
    if (!expiresAt) return false;
    return new Date(expiresAt) < new Date();
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold mb-2">مدیریت کاربران زیرمجموعه</h1>
          <p className="text-muted-foreground">
            ایجاد و مدیریت کاربران با حجم و زمان اختصاصی برای هر توکن
          </p>
        </div>
        
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 ml-2" />
              افزودن کاربر جدید
            </Button>
          </DialogTrigger>
          
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>افزودن کاربر زیرمجموعه جدید</DialogTitle>
            </DialogHeader>
            
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="token">توکن والد</Label>
                  <select
                    id="token"
                    value={selectedToken}
                    onChange={(e) => setSelectedToken(e.target.value)}
                    className="w-full p-2 border rounded-md"
                    required
                  >
                    <option value="">انتخاب توکن...</option>
                    {tokens?.map((token) => (
                      <option key={token.id} value={token.id}>
                        {token.name} - {token.panel_url}
                      </option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <Label htmlFor="username">نام کاربری</Label>
                  <Input
                    id="username"
                    value={newUser.username}
                    onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="password">رمز عبور</Label>
                <Input
                  id="password"
                  type="password"
                  value={newUser.password}
                  onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="traffic">حجم ترافیک (گیگابایت)</Label>
                  <Input
                    id="traffic"
                    type="number"
                    min="0"
                    step="0.1"
                    value={newUser.traffic_limit_gb}
                    onChange={(e) => setNewUser({ ...newUser, traffic_limit_gb: parseFloat(e.target.value) || 0 })}
                  />
                  <p className="text-xs text-muted-foreground mt-1">0 = نامحدود</p>
                </div>

                <div>
                  <Label htmlFor="time">مدت زمان (روز)</Label>
                  <Input
                    id="time"
                    type="number"
                    min="0"
                    value={newUser.time_limit_days}
                    onChange={(e) => setNewUser({ ...newUser, time_limit_days: parseInt(e.target.value) || 0 })}
                  />
                  <p className="text-xs text-muted-foreground mt-1">0 = نامحدود</p>
                </div>
              </div>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center">
                    <Settings className="w-4 h-4 ml-2" />
                    تنظیمات پنل اختصاصی
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <Label htmlFor="inbound">شناسه Inbound</Label>
                    <Input
                      id="inbound"
                      type="number"
                      value={newUser.inbound_id}
                      onChange={(e) => setNewUser({ ...newUser, inbound_id: parseInt(e.target.value) || 0 })}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="flow">Flow</Label>
                      <Input
                        id="flow"
                        value={newUser.flow}
                        onChange={(e) => setNewUser({ ...newUser, flow: e.target.value })}
                        placeholder="مثلاً: xtls-rprx-vision"
                      />
                    </div>

                    <div>
                      <Label htmlFor="security">Security</Label>
                      <select
                        id="security"
                        value={newUser.security}
                        onChange={(e) => setNewUser({ ...newUser, security: e.target.value })}
                        className="w-full p-2 border rounded-md"
                      >
                        <option value="none">None</option>
                        <option value="tls">TLS</option>
                        <option value="reality">Reality</option>
                      </select>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                  انصراف
                </Button>
                <Button type="submit" disabled={addMutation.isPending}>
                  {addMutation.isPending ? 'در حال افزودن...' : 'افزودن کاربر'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {!selectedToken && tokens && tokens.length > 0 && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <Label>انتخاب توکن برای مشاهده کاربران:</Label>
              <select
                value={selectedToken}
                onChange={(e) => setSelectedToken(e.target.value)}
                className="flex-1 p-2 border rounded-md"
              >
                <option value="">انتخاب کنید...</option>
                {tokens.map((token) => (
                  <option key={token.id} value={token.id}>
                    {token.name} - {token.panel_url}
                  </option>
                ))}
              </select>
            </div>
          </CardContent>
        </Card>
      )}

      {selectedToken && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Users className="w-5 h-5 ml-2" />
              کاربران زیرمجموعه
              {subUsers && (
                <Badge variant="secondary" className="mr-2">
                  {subUsers.length} کاربر
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8">در حال بارگذاری...</div>
            ) : subUsers && subUsers.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>نام کاربری</TableHead>
                    <TableHead>ترافیک</TableHead>
                    <TableHead>زمان</TableHead>
                    <TableHead>وضعیت</TableHead>
                    <TableHead>تنظیمات پنل</TableHead>
                    <TableHead>عملیات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {subUsers.map((user) => {
                    const trafficPercent = getTrafficProgress(user.traffic_used_gb, user.traffic_limit_gb);
                    const expired = isExpired(user.expires_at);

                    return (
                      <TableRow key={user.id}>
                        <TableCell className="font-medium">{user.username}</TableCell>
                        
                        <TableCell className="w-48">
                          <div className="space-y-1">
                            <div className="flex justify-between text-xs">
                              <span>{user.traffic_used_gb.toFixed(1)} GB</span>
                              <span>{formatTraffic(user.traffic_limit_gb)}</span>
                            </div>
                            {user.traffic_limit_gb > 0 && (
                              <div className="w-full bg-gray-200 rounded-full h-2">
                                <div
                                  className={`h-2 rounded-full ${trafficPercent > 80 ? 'bg-red-500' : 'bg-blue-500'}`}
                                  style={{ width: `${trafficPercent}%` }}
                                />
                              </div>
                            )}
                          </div>
                        </TableCell>

                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {user.time_limit_days === 0 ? (
                              <span className="text-xs">نامحدود</span>
                            ) : expired ? (
                              <Badge variant="destructive" className="text-xs">منقضی</Badge>
                            ) : (
                              <span className="text-xs">
                                {user.expires_at 
                                  ? new Date(user.expires_at).toLocaleDateString('fa-IR')
                                  : '-'}
                              </span>
                            )}
                          </div>
                        </TableCell>

                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Badge variant={user.is_active && !expired ? 'default' : 'secondary'}>
                              {user.is_active && !expired ? 'فعال' : 'غیرفعال'}
                            </Badge>
                            {user.is_online && (
                              <Wifi className="w-3 h-3 text-green-500" />
                            )}
                          </div>
                        </TableCell>

                        <TableCell>
                          <div className="text-xs space-y-1">
                            <div>Inbound: {user.panel_settings?.inbound_id || '-'}</div>
                            <div>Security: {user.panel_settings?.security || 'none'}</div>
                          </div>
                        </TableCell>

                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={user.is_active}
                              onCheckedChange={(checked) =>
                                toggleStatusMutation.mutate({ id: user.id, is_active: checked })
                              }
                            />
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => deleteMutation.mutate(user.id)}
                            >
                              <Trash2 className="w-4 h-4 text-red-500" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                هنوز کاربری اضافه نشده است
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
