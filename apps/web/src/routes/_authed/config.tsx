import { createFileRoute, Outlet, Link, useLocation } from "@tanstack/react-router";
import { Server, Settings } from "lucide-react";
import {
  SidebarProvider,
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarHeader,
  SidebarInset,
} from "@/components/ui/sidebar";

export const Route = createFileRoute("/_authed/config")({
  component: ConfigLayout,
});

const menuItems = [
  {
    title: "Gateway",
    url: "/config/gateway",
    icon: Server,
  },
  {
    title: "Preferences",
    url: "/config/preferences",
    icon: Settings,
  },
];

function ConfigLayout() {
  const location = useLocation();

  return (
    <SidebarProvider className="min-h-screen">
      <Sidebar collapsible="none" className="h-screen">
        <SidebarHeader>
          <Link to="/chat" search={{ sessionId: undefined, instance: undefined }} className="flex items-center gap-2 px-2 py-1">
            <span className="text-2xl">🐷</span>
            <span className="font-semibold">Oinky</span>
          </Link>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Settings</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {menuItems.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      isActive={location.pathname === item.url}
                    >
                      <Link to={item.url}>
                        <item.icon />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>
      <SidebarInset>
        <Outlet />
      </SidebarInset>
    </SidebarProvider>
  );
}
