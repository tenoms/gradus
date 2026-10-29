import {
  BookOpen,
  Bookmark,
  CalendarDays,
  ChartNoAxesCombined,
  FileText,
  GraduationCap,
  Layers3,
  LayoutDashboard,
  MessageCircle,
  Target,
  Video,
} from "lucide-react";
export const navItems = [
  { to: "/", label: "学习概览", icon: LayoutDashboard },
  { to: "/study/question-bank", label: "题库与真题", icon: BookOpen },
  { to: "/study/practice", label: "专项练习", icon: Target },
  { to: "/study/exams", label: "模拟测评", icon: FileText },
  { to: "/study/courses", label: "我的课程", icon: Video },
];

export const libraryItems = [
  { to: "/study/review", label: "错题与收藏", icon: Bookmark },
  { to: "/study/notes", label: "学习笔记", icon: FileText },
  { to: "/plan", label: "学习计划", icon: CalendarDays },
  { to: "/insights", label: "学习报告", icon: ChartNoAxesCombined },
];

export const extraItems = [
  { to: "/study/schools", label: "院校与专业", icon: GraduationCap },
  { to: "/study/community", label: "学习社区", icon: MessageCircle },
  { to: "/study/resources", label: "资讯与资料", icon: Layers3 },
];

export const sectionTitles: Record<string, [string, string]> = {
  "question-bank": ["题库与真题", "从章节到真题，找到当下要解决的问题。"],
  practice: ["专项练习", "把知识点学透，把每一步练扎实。"],
  exams: ["模拟测评", "以一次完整作答，检验学习成果。"],
  courses: ["我的课程", "继续学习，让每个知识点都有来处。"],
  review: ["错题与收藏", "回看曾经的疑问，把薄弱处变成优势。"],
  notes: ["学习笔记", "记录理解发生的瞬间。"],
  schools: ["院校与专业", "了解目标，让选择更清晰。"],
  community: ["学习社区", "在交流与分享中一起进步。"],
  resources: ["资讯与资料", "收好有用的信息，留给需要的时候。"],
};
