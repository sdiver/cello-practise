import axios from 'axios'

const http = axios.create({
  baseURL: '/api',
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' }
})

export const api = {
  // 用户
  login: (username: string, nickname?: string) =>
    http.post('/users/login', { username, nickname }).then(r => r.data),
  getUser: (id: number) =>
    http.get(`/users/${id}`).then(r => r.data),
  getUserSettings: (id: number) =>
    http.get(`/users/${id}/settings`).then(r => r.data),
  updateUserSettings: (id: number, settings: any) =>
    http.put(`/users/${id}/settings`, settings).then(r => r.data),

  // 曲谱
  getSheets: (params?: any) =>
    http.get('/sheets', { params }).then(r => r.data),
  getSheet: (id: number) =>
    http.get(`/sheets/${id}`).then(r => r.data),
  uploadSheet: (formData: FormData) =>
    http.post('/sheets/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 300000
    }).then(r => r.data),
  saveSheet: (data: any) =>
    http.post('/sheets/save', data).then(r => r.data),
  deleteSheet: (id: number) =>
    http.delete(`/sheets/${id}`).then(r => r.data),

  // 收藏
  getFavorites: (userId: number) =>
    http.get(`/sheets/user/favorites`, { params: { user_id: userId } }).then(r => r.data),
  addFavorite: (id: number, userId: number) =>
    http.post(`/sheets/${id}/favorite`, { user_id: userId }).then(r => r.data),
  removeFavorite: (id: number, userId: number) =>
    http.delete(`/sheets/${id}/favorite`, { data: { user_id: userId } }).then(r => r.data),

  // 搜索
  searchSheets: (query: string, source = 'all', page = 1) =>
    http.get('/search/sheets', { params: { q: query, source, page } }).then(r => r.data),
  getSearchHistory: (userId: number) =>
    http.get('/search/history', { params: { user_id: userId } }).then(r => r.data),
  getTrending: () =>
    http.get('/search/trending').then(r => r.data),

  // 练习
  getPracticeRecords: (userId: number, params?: any) =>
    http.get('/practice/records', { params: { user_id: userId, ...params } }).then(r => r.data),
  getPracticeStats: (userId: number, period = 30) =>
    http.get('/practice/stats', { params: { user_id: userId, period } }).then(r => r.data),
  savePracticeRecord: (data: any) =>
    http.post('/practice/records', data).then(r => r.data),

  // 练习计划
  getPracticePlans: (userId: number, status?: string) =>
    http.get('/practice/plans', { params: { user_id: userId, status } }).then(r => r.data),
  createPracticePlan: (data: any) =>
    http.post('/practice/plans', data).then(r => r.data),

  // AI
  analyzePractice: (data: any) =>
    http.post('/ai/analyze', data, { timeout: 60000 }).then(r => r.data),
  chatWithAI: (message: string, userId: number, sessionId = 'default') =>
    http.post('/ai/chat', { message, user_id: userId, session_id: sessionId }, { timeout: 60000 }).then(r => r.data),
  getChatHistory: (userId: number, sessionId = 'default') =>
    http.get('/ai/chat/history', { params: { user_id: userId, session_id: sessionId } }).then(r => r.data),
  generatePlan: (data: any) =>
    http.post('/ai/plan', data, { timeout: 60000 }).then(r => r.data),

  // MuseScore MIDI 下载
  downloadMuseScoreMidi: (url: string, userId = 1) =>
    http.post('/musescore/download', { url, user_id: userId }, { timeout: 120000 }).then(r => r.data),
  listMidiFiles: () =>
    http.get('/musescore/midi').then(r => r.data),
  getMidiNotes: (filename: string) =>
    http.get(`/musescore/midi/${filename}/notes`).then(r => r.data),

  // MusicXML 渲染
  getMusicXmlContent: (sheetId: number) =>
    http.get(`/musicxml/${sheetId}/render`, { responseType: 'text', transformResponse: [(d: any) => d] }).then(r => r.data as string),
}
