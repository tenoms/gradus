type Row = Record<string, any>;
export type PacketAssignmentStatus = "pending" | "in-progress" | "grading" | "completed";
export type PacketAssignmentEntry = {
  id: string;
  title: string;
  row: Row;
  status: PacketAssignmentStatus;
  statusLabel: string;
  isTeacher: boolean;
  score?: number | string;
  completedAt?: string;
};
export type PacketAssignment = PacketAssignmentEntry;
export type PacketAssignmentModule = {
  id: string;
  title: string;
  task: Row;
  assignments: PacketAssignmentEntry[];
};
export type PacketAssignmentChapter = {
  id: string;
  title: string;
  modules: PacketAssignmentModule[];
};
export type PacketAssignmentGroup = {
  id: string;
  title: string;
  chapters: PacketAssignmentChapter[];
};
export function mergePacketAssignmentProgress(tasks: Row[], records: Row[], students: Row[], productID: number | string): Row[];
export function packetAssignmentGroups(tasks: Row[], treeRows: Row[], packetID: number | string): PacketAssignmentGroup[];
