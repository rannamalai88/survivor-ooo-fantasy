'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '@/lib/supabase/client';

interface Manager {
  id: string;
  name: string;
  is_commissioner: boolean;
  season_id: string;
  draft_position: number;
  partner_id: string | null;
}

interface AuthContextType {
  manager: Manager | null;
  managers: Manager[];
  isLoading: boolean;
  isCommissioner: boolean;
  login: (managerName: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType>({
  manager: null,
  managers: [],
  isLoading: true,
  isCommissioner: false,
  login: () => {},
  logout: () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

const STORAGE_KEY = 'survivor-ooo-manager';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [manager, setManager] = useState<Manager | null>(null);
  const [managers, setManagers] = useState<Manager[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchManagers() {
      const { data, error } = await supabase
        .from('managers')
        .select('*')
        .order('draft_position', { ascending: true });

      if (error) {
        console.error('Error fetching managers:', error);
        setIsLoading(false);
        return;
      }

      setManagers(data || []);

      const savedName = localStorage.getItem(STORAGE_KEY);
      if (savedName && data) {
        const found = data.find(
          (m: Manager) => m.name.toLowerCase() === savedName.toLowerCase()
        );
        if (found) setManager(found);
      }

      setIsLoading(false);
    }

    fetchManagers();
  }, []);

  const login = (managerName: string) => {
    const found = managers.find(
      (m) => m.name.toLowerCase() === managerName.toLowerCase()
    );
    if (found) {
      setManager(found);
      localStorage.setItem(STORAGE_KEY, found.name);
    }
  };

  const logout = () => {
    setManager(null);
    localStorage.removeItem(STORAGE_KEY);
  };

  return (
    <AuthContext.Provider
      value={{
        manager,
        managers,
        isLoading,
        isCommissioner: manager?.is_commissioner ?? false,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
