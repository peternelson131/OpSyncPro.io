import { useState, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { supabase } from '../lib/supabase';
import { toast } from 'react-toastify';
import {
  Plus,
  GripVertical,
  Clock,
  Target,
  CheckCircle2,
  Inbox as InboxIcon,
  ClipboardList,
  AlertCircle,
  Paperclip,
  X,
  Upload,
  Download,
  Trash2,
  Image as ImageIcon
} from 'lucide-react';

// Priority badge colors
const priorityColors = {
  p0: 'bg-red-500/10 text-red-500 border-red-500/30',
  p1: 'bg-orange-500/10 text-orange-500 border-orange-500/30',
  p2: 'bg-blue-500/10 text-blue-500 border-blue-500/30'
};

// Column configurations
const columns = [
  { id: 'inbox', title: 'Inbox', icon: InboxIcon, color: 'text-gray-400' },
  { id: 'backlog', title: 'Backlog', icon: ClipboardList, color: 'text-blue-400' },
  { id: 'in_progress', title: 'In Progress', icon: Clock, color: 'text-orange-400' },
  { id: 'done', title: 'Done', icon: CheckCircle2, color: 'text-green-400' }
];

export default function MissionControl() {
  const queryClient = useQueryClient();
  const [selectedTask, setSelectedTask] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [createInStatus, setCreateInStatus] = useState(null);
  const [uploadingFiles, setUploadingFiles] = useState(false);

  // Fetch tasks
  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ['mission-control-tasks'],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('mission_control_tasks')
        .select('*')
        .eq('user_id', session.user.id)
        .order('sort_order', { ascending: true });

      if (error) throw error;
      return data || [];
    }
  });

  // Update task mutation
  const updateTaskMutation = useMutation({
    mutationFn: async ({ id, updates }) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('mission_control_tasks')
        .update(updates)
        .eq('id', id)
        .eq('user_id', session.user.id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['mission-control-tasks']);
    },
    onError: (error) => {
      toast.error(`Failed to update task: ${error.message}`);
    }
  });

  // Create task mutation
  const createTaskMutation = useMutation({
    mutationFn: async (taskData) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      // Find max sort_order in the target status
      const tasksInStatus = tasks.filter(t => t.status === taskData.status);
      const maxSort = tasksInStatus.length > 0 
        ? Math.max(...tasksInStatus.map(t => t.sort_order || 0))
        : 0;

      const { data, error } = await supabase
        .from('mission_control_tasks')
        .insert({
          ...taskData,
          user_id: session.user.id,
          sort_order: maxSort + 100,
          attachments: []
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['mission-control-tasks']);
      toast.success('Task created successfully');
      setIsCreating(false);
      setCreateInStatus(null);
    },
    onError: (error) => {
      toast.error(`Failed to create task: ${error.message}`);
    }
  });

  // Delete task mutation
  const deleteTaskMutation = useMutation({
    mutationFn: async (id) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('mission_control_tasks')
        .delete()
        .eq('id', id)
        .eq('user_id', session.user.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['mission-control-tasks']);
      toast.success('Task deleted');
      setIsModalOpen(false);
      setSelectedTask(null);
    },
    onError: (error) => {
      toast.error(`Failed to delete task: ${error.message}`);
    }
  });

  // Handle drag end
  const onDragEnd = useCallback((result) => {
    if (!result.destination) return;

    const { source, destination, draggableId } = result;
    
    // Get source and destination statuses
    const sourceStatus = source.droppableId;
    const destStatus = destination.droppableId;
    
    // If dropped in same position, do nothing
    if (sourceStatus === destStatus && source.index === destination.index) {
      return;
    }

    // Get tasks in source and destination columns
    const sourceTasks = tasks
      .filter(t => t.status === sourceStatus)
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    
    const destTasks = sourceStatus === destStatus 
      ? sourceTasks 
      : tasks
          .filter(t => t.status === destStatus)
          .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

    // Find the dragged task
    const draggedTask = tasks.find(t => t.id === draggableId);
    if (!draggedTask) return;

    // Calculate new sort_order
    let newSortOrder;
    if (destTasks.length === 0) {
      newSortOrder = 100;
    } else if (destination.index === 0) {
      newSortOrder = destTasks[0].sort_order - 100;
    } else if (destination.index >= destTasks.length) {
      newSortOrder = destTasks[destTasks.length - 1].sort_order + 100;
    } else {
      const before = destTasks[destination.index - 1];
      const after = destTasks[destination.index];
      newSortOrder = (before.sort_order + after.sort_order) / 2;
    }

    // Update the task
    const updates = {
      status: destStatus,
      sort_order: newSortOrder
    };

    // If moving to done, set completed_at
    if (destStatus === 'done' && !draggedTask.completed_at) {
      updates.completed_at = new Date().toISOString();
    } else if (destStatus !== 'done' && draggedTask.completed_at) {
      updates.completed_at = null;
    }

    updateTaskMutation.mutate({ id: draggableId, updates });
  }, [tasks, updateTaskMutation]);

  // Group tasks by status
  const tasksByStatus = columns.reduce((acc, col) => {
    acc[col.id] = tasks
      .filter(t => t.status === col.id)
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    return acc;
  }, {});

  // File upload to Supabase Storage
  const uploadFile = async (file) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Not authenticated');

    const fileExt = file.name.split('.').pop();
    const fileName = `${session.user.id}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

    const { data, error } = await supabase.storage
      .from('mission-control-attachments')
      .upload(fileName, file);

    if (error) throw error;

    const { data: { publicUrl } } = supabase.storage
      .from('mission-control-attachments')
      .getPublicUrl(fileName);

    return {
      url: publicUrl,
      filename: file.name,
      size: file.size,
      type: file.type
    };
  };

  // Handle file upload
  const handleFileUpload = async (e, taskId) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setUploadingFiles(true);
    try {
      const uploadPromises = files.map(file => uploadFile(file));
      const uploadedFiles = await Promise.all(uploadPromises);

      const task = tasks.find(t => t.id === taskId);
      const currentAttachments = task?.attachments || [];
      
      await updateTaskMutation.mutateAsync({
        id: taskId,
        updates: {
          attachments: [...currentAttachments, ...uploadedFiles]
        }
      });

      toast.success(`${files.length} file(s) uploaded`);
    } catch (error) {
      toast.error(`Failed to upload files: ${error.message}`);
    } finally {
      setUploadingFiles(false);
    }
  };

  // Remove attachment
  const removeAttachment = async (taskId, attachmentIndex) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    const attachments = [...(task.attachments || [])];
    attachments.splice(attachmentIndex, 1);

    await updateTaskMutation.mutateAsync({
      id: taskId,
      updates: { attachments }
    });

    toast.success('Attachment removed');
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-theme-secondary">Loading tasks...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-theme-primary p-4">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-theme-primary mb-2">Mission Control</h1>
        <p className="text-theme-secondary">Track and manage your development tasks</p>
      </div>

      {/* Kanban Board */}
      <DragDropContext onDragEnd={onDragEnd}>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {columns.map(column => {
            const Icon = column.icon;
            const columnTasks = tasksByStatus[column.id] || [];

            return (
              <div key={column.id} className="flex flex-col">
                {/* Column Header */}
                <div className="bg-theme-surface rounded-t-lg border border-theme p-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Icon className={`h-5 w-5 ${column.color}`} />
                    <h2 className="font-semibold text-theme-primary">{column.title}</h2>
                    <span className="text-xs text-theme-tertiary bg-theme-hover px-2 py-0.5 rounded-full">
                      {columnTasks.length}
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      setCreateInStatus(column.id);
                      setIsCreating(true);
                    }}
                    className="p-1 hover:bg-theme-hover rounded transition-colors"
                    title="Add task"
                  >
                    <Plus className="h-4 w-4 text-theme-secondary" />
                  </button>
                </div>

                {/* Column Content */}
                <Droppable droppableId={column.id}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className={`flex-1 bg-theme-surface rounded-b-lg border border-t-0 border-theme p-2 min-h-[200px] transition-colors ${
                        snapshot.isDraggingOver ? 'bg-accent/5' : ''
                      }`}
                    >
                      <div className="space-y-2">
                        {columnTasks.map((task, index) => (
                          <Draggable key={task.id} draggableId={task.id} index={index}>
                            {(provided, snapshot) => (
                              <div
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                className={`bg-theme-primary border border-theme rounded-lg p-3 cursor-pointer hover:border-accent transition-all ${
                                  snapshot.isDragging ? 'shadow-lg rotate-2' : ''
                                }`}
                                onClick={() => {
                                  setSelectedTask(task);
                                  setIsModalOpen(true);
                                }}
                              >
                                {/* Drag Handle */}
                                <div
                                  {...provided.dragHandleProps}
                                  className="flex items-center gap-2 mb-2"
                                >
                                  <GripVertical className="h-4 w-4 text-theme-tertiary flex-shrink-0" />
                                  <div className="flex items-center gap-2 flex-1 min-w-0">
                                    <span className={`px-2 py-0.5 text-xs font-medium rounded border ${priorityColors[task.priority]}`}>
                                      {task.priority.toUpperCase()}
                                    </span>
                                    {task.category && (
                                      <span className="px-2 py-0.5 text-xs font-medium rounded bg-theme-hover text-theme-secondary">
                                        {task.category}
                                      </span>
                                    )}
                                  </div>
                                </div>

                                {/* Task Title */}
                                <h3 className="text-sm font-medium text-theme-primary mb-1 line-clamp-2">
                                  {task.title}
                                </h3>

                                {/* Task Description Preview */}
                                {task.description && (
                                  <p className="text-xs text-theme-tertiary line-clamp-2 mb-2">
                                    {task.description}
                                  </p>
                                )}

                                {/* Task Footer */}
                                <div className="flex items-center justify-between text-xs text-theme-tertiary">
                                  <div className="flex items-center gap-2">
                                    {task.estimate && (
                                      <span className="flex items-center gap-1">
                                        <Clock className="h-3 w-3" />
                                        {task.estimate}
                                      </span>
                                    )}
                                    {task.attachments && task.attachments.length > 0 && (
                                      <span className="flex items-center gap-1">
                                        <Paperclip className="h-3 w-3" />
                                        {task.attachments.length}
                                      </span>
                                    )}
                                  </div>
                                  {task.completed_at && (
                                    <CheckCircle2 className="h-3 w-3 text-green-500" />
                                  )}
                                </div>
                              </div>
                            )}
                          </Draggable>
                        ))}
                        {provided.placeholder}
                      </div>
                    </div>
                  )}
                </Droppable>
              </div>
            );
          })}
        </div>
      </DragDropContext>

      {/* Task Detail/Edit Modal */}
      {isModalOpen && selectedTask && (
        <TaskModal
          task={selectedTask}
          onClose={() => {
            setIsModalOpen(false);
            setSelectedTask(null);
          }}
          onUpdate={(updates) => updateTaskMutation.mutate({ id: selectedTask.id, updates })}
          onDelete={() => deleteTaskMutation.mutate(selectedTask.id)}
          onFileUpload={(e) => handleFileUpload(e, selectedTask.id)}
          onRemoveAttachment={(index) => removeAttachment(selectedTask.id, index)}
          uploadingFiles={uploadingFiles}
        />
      )}

      {/* Create Task Modal */}
      {isCreating && (
        <CreateTaskModal
          status={createInStatus}
          onCreate={(taskData) => createTaskMutation.mutate(taskData)}
          onClose={() => {
            setIsCreating(false);
            setCreateInStatus(null);
          }}
        />
      )}
    </div>
  );
}

// Task Detail Modal Component
function TaskModal({ task, onClose, onUpdate, onDelete, onFileUpload, onRemoveAttachment, uploadingFiles }) {
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    title: task.title || '',
    description: task.description || '',
    priority: task.priority || 'p2',
    category: task.category || '',
    estimate: task.estimate || '',
    pr_url: task.pr_url || '',
    evidence: task.evidence || ''
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onUpdate(formData);
    setIsEditing(false);
  };

  const markAsDone = () => {
    onUpdate({
      status: 'done',
      completed_at: new Date().toISOString()
    });
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-theme-surface rounded-lg border border-theme max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Modal Header */}
        <div className="sticky top-0 bg-theme-surface border-b border-theme p-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-theme-primary">Task Details</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-theme-hover rounded-lg transition-colors"
          >
            <X className="h-5 w-5 text-theme-secondary" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-6">
          {isEditing ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-theme-secondary mb-1">Title</label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full px-3 py-2 bg-theme-primary border border-theme rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-accent"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-theme-secondary mb-1">Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={4}
                  className="w-full px-3 py-2 bg-theme-primary border border-theme rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-accent resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-theme-secondary mb-1">Priority</label>
                  <select
                    value={formData.priority}
                    onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                    className="w-full px-3 py-2 bg-theme-primary border border-theme rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-accent"
                  >
                    <option value="p0">P0 - Critical</option>
                    <option value="p1">P1 - High</option>
                    <option value="p2">P2 - Normal</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-theme-secondary mb-1">Category</label>
                  <input
                    type="text"
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full px-3 py-2 bg-theme-primary border border-theme rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-accent"
                    placeholder="e.g., bug, feature"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-theme-secondary mb-1">Estimate</label>
                <input
                  type="text"
                  value={formData.estimate}
                  onChange={(e) => setFormData({ ...formData, estimate: e.target.value })}
                  className="w-full px-3 py-2 bg-theme-primary border border-theme rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-accent"
                  placeholder="e.g., 2h, 30m"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-theme-secondary mb-1">PR URL</label>
                <input
                  type="url"
                  value={formData.pr_url}
                  onChange={(e) => setFormData({ ...formData, pr_url: e.target.value })}
                  className="w-full px-3 py-2 bg-theme-primary border border-theme rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-accent"
                  placeholder="https://github.com/..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-theme-secondary mb-1">Evidence URL</label>
                <input
                  type="url"
                  value={formData.evidence}
                  onChange={(e) => setFormData({ ...formData, evidence: e.target.value })}
                  className="w-full px-3 py-2 bg-theme-primary border border-theme rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-accent"
                  placeholder="https://..."
                />
              </div>

              <div className="flex gap-2">
                <button
                  type="submit"
                  className="px-4 py-2 bg-accent text-white rounded-lg hover:opacity-90 transition-opacity"
                >
                  Save Changes
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="px-4 py-2 bg-theme-hover text-theme-secondary rounded-lg hover:opacity-90 transition-opacity"
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <div className="space-y-4">
              {/* Task Info */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className={`px-2 py-0.5 text-xs font-medium rounded border ${priorityColors[task.priority]}`}>
                    {task.priority.toUpperCase()}
                  </span>
                  {task.category && (
                    <span className="px-2 py-0.5 text-xs font-medium rounded bg-theme-hover text-theme-secondary">
                      {task.category}
                    </span>
                  )}
                  {task.estimate && (
                    <span className="text-xs text-theme-tertiary flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {task.estimate}
                    </span>
                  )}
                </div>
                <h3 className="text-xl font-semibold text-theme-primary mb-2">{task.title}</h3>
                {task.description && (
                  <p className="text-theme-secondary whitespace-pre-wrap">{task.description}</p>
                )}
              </div>

              {/* Links */}
              {(task.pr_url || task.evidence) && (
                <div className="space-y-2">
                  {task.pr_url && (
                    <div>
                      <span className="text-sm font-medium text-theme-secondary">PR: </span>
                      <a
                        href={task.pr_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-accent hover:underline"
                      >
                        {task.pr_url}
                      </a>
                    </div>
                  )}
                  {task.evidence && (
                    <div>
                      <span className="text-sm font-medium text-theme-secondary">Evidence: </span>
                      <a
                        href={task.evidence}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-accent hover:underline"
                      >
                        {task.evidence}
                      </a>
                    </div>
                  )}
                </div>
              )}

              {/* Attachments */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-medium text-theme-secondary">Attachments</h4>
                  <label className="cursor-pointer">
                    <input
                      type="file"
                      multiple
                      onChange={onFileUpload}
                      className="hidden"
                      disabled={uploadingFiles}
                    />
                    <div className="flex items-center gap-1 px-3 py-1 bg-accent text-white text-xs rounded hover:opacity-90 transition-opacity">
                      <Upload className="h-3 w-3" />
                      {uploadingFiles ? 'Uploading...' : 'Upload'}
                    </div>
                  </label>
                </div>

                {task.attachments && task.attachments.length > 0 ? (
                  <div className="space-y-2">
                    {task.attachments.map((attachment, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between p-2 bg-theme-primary border border-theme rounded"
                      >
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          {attachment.type?.startsWith('image/') ? (
                            <ImageIcon className="h-4 w-4 text-theme-tertiary flex-shrink-0" />
                          ) : (
                            <Paperclip className="h-4 w-4 text-theme-tertiary flex-shrink-0" />
                          )}
                          <span className="text-sm text-theme-secondary truncate">
                            {attachment.filename}
                          </span>
                          <span className="text-xs text-theme-tertiary">
                            ({Math.round(attachment.size / 1024)}KB)
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <a
                            href={attachment.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1 hover:bg-theme-hover rounded transition-colors"
                            title="Download"
                          >
                            <Download className="h-4 w-4 text-theme-secondary" />
                          </a>
                          <button
                            onClick={() => onRemoveAttachment(index)}
                            className="p-1 hover:bg-red-500/10 rounded transition-colors"
                            title="Remove"
                          >
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-theme-tertiary">No attachments</p>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-4 border-t border-theme">
                <button
                  onClick={() => setIsEditing(true)}
                  className="px-4 py-2 bg-accent text-white rounded-lg hover:opacity-90 transition-opacity"
                >
                  Edit
                </button>
                {task.status !== 'done' && (
                  <button
                    onClick={markAsDone}
                    className="px-4 py-2 bg-green-500 text-white rounded-lg hover:opacity-90 transition-opacity"
                  >
                    Mark as Done
                  </button>
                )}
                <button
                  onClick={onDelete}
                  className="px-4 py-2 bg-red-500 text-white rounded-lg hover:opacity-90 transition-opacity ml-auto"
                >
                  Delete
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Create Task Modal Component
function CreateTaskModal({ status, onCreate, onClose }) {
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    priority: 'p2',
    category: '',
    estimate: '',
    status: status || 'inbox'
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onCreate(formData);
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-theme-surface rounded-lg border border-theme max-w-2xl w-full">
        {/* Modal Header */}
        <div className="border-b border-theme p-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-theme-primary">Create New Task</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-theme-hover rounded-lg transition-colors"
          >
            <X className="h-5 w-5 text-theme-secondary" />
          </button>
        </div>

        {/* Modal Content */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-theme-secondary mb-1">Title *</label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="w-full px-3 py-2 bg-theme-primary border border-theme rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-accent"
              required
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-theme-secondary mb-1">Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={4}
              className="w-full px-3 py-2 bg-theme-primary border border-theme rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-accent resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-theme-secondary mb-1">Priority</label>
              <select
                value={formData.priority}
                onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                className="w-full px-3 py-2 bg-theme-primary border border-theme rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-accent"
              >
                <option value="p0">P0 - Critical</option>
                <option value="p1">P1 - High</option>
                <option value="p2">P2 - Normal</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-theme-secondary mb-1">Category</label>
              <input
                type="text"
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                className="w-full px-3 py-2 bg-theme-primary border border-theme rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-accent"
                placeholder="e.g., bug, feature"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-theme-secondary mb-1">Estimate</label>
            <input
              type="text"
              value={formData.estimate}
              onChange={(e) => setFormData({ ...formData, estimate: e.target.value })}
              className="w-full px-3 py-2 bg-theme-primary border border-theme rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-accent"
              placeholder="e.g., 2h, 30m"
            />
          </div>

          <div className="flex gap-2 pt-4">
            <button
              type="submit"
              className="px-4 py-2 bg-accent text-white rounded-lg hover:opacity-90 transition-opacity"
            >
              Create Task
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-theme-hover text-theme-secondary rounded-lg hover:opacity-90 transition-opacity"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
