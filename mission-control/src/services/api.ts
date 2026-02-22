import axios from 'axios';

const api = axios.create({
  baseURL: `http://${window.location.hostname}:3001/api`
});

export const missionApi = {
  getData: () => api.get('/data').then(res => res.data),
  updateData: (data: any) => api.post('/data', data),
  
  // Task shortcuts
  addTask: (task: any) => api.post('/tasks', task).then(res => res.data),
  updateTask: (id: string, updates: any) => api.patch(`/tasks/${id}`, updates),
  deleteTask: (id: string) => api.delete(`/tasks/${id}`),
  
  // Strategy shortcuts
  updateObjective: (id: string, updates: any) => api.patch(`/objectives/${id}`, updates),
};
