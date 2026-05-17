import React, {createContext, useContext, useMemo} from 'react';
import HabitService from './HabitService';
import SyncService from './SyncService';
import NotificationService from './NotificationService';
import database from '../models';

export interface Services {
  habitService: HabitService;
  syncService: SyncService;
  notificationService: NotificationService;
}

const ServicesContext = createContext<Services | null>(null);

export const ServicesProvider: React.FC<{children: React.ReactNode}> = ({
  children,
}) => {
  const services = useMemo<Services>(() => {
    const habitService = new HabitService(database);
    const syncService = new SyncService(habitService);
    const notificationService = new NotificationService();
    return {habitService, syncService, notificationService};
  }, []);

  return (
    <ServicesContext.Provider value={services}>
      {children}
    </ServicesContext.Provider>
  );
};

export const useServices = (): Services | null => useContext(ServicesContext);
