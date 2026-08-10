import React, { useEffect, useRef } from "react";
import { ActivityIndicator, View } from "react-native";
import {
  NavigationContainer,
  createNavigationContainerRef,
  type LinkingOptions,
} from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import * as Linking from "expo-linking";
import * as Notifications from "expo-notifications";
import { AuthProvider, useAuth } from "@/state/auth";
import { AppProvider } from "@/state/app";
import { useApp } from "@/state/app";
import { colors } from "@/theme/tokens";
import { AuthScreen } from "@/screens/AuthScreen";
import { ProjectsScreen } from "@/screens/ProjectsScreen";
import { TodayScreen } from "@/screens/TodayScreen";
import { DiaryScreen } from "@/screens/DiaryScreen";
import { DiaryDraftReviewScreen } from "@/screens/DiaryDraftReviewScreen";
import { DelayScreen } from "@/screens/DelayScreen";
import { CheckinScreen, PublicCheckinScreen } from "@/screens/CheckinScreen";
import { ReportsScreen } from "@/screens/ReportsScreen";
import { DiaryApprovalsScreen } from "@/screens/DiaryApprovalsScreen";
import { ClientShareScreen } from "@/screens/ClientShareScreen";
import { SettingsScreen } from "@/screens/SettingsScreen";
import { ReceiptsScreen } from "@/screens/ReceiptsScreen";
import { ReceiptEditorScreen } from "@/screens/ReceiptEditorScreen";
import { ReceiptReportsScreen } from "@/screens/ReceiptReportsScreen";
import { WorkforceScreen } from "@/screens/WorkforceScreen";
import { RequestReceiptLinkScreen } from "@/screens/RequestReceiptLinkScreen";
import { NotificationsScreen } from "@/screens/NotificationsScreen";
import { PilotAccountScreen } from "@/screens/PilotAccountScreen";
import { GalleryScreen } from "@/screens/GalleryScreen";
import { SupportScreen } from "@/screens/SupportScreen";
import { PrivacyScreen } from "@/screens/PrivacyScreen";
import { PlansScreen } from "@/screens/PlansScreen";
import { PlanBoardScreen } from "@/screens/PlanBoardScreen";
import { TasksScreen } from "@/screens/TasksScreen";
import { TaskEditorScreen } from "@/screens/TaskEditorScreen";
import { TaskEvidenceReportScreen } from "@/screens/TaskEvidenceReportScreen";
import { WeeklyReportScreen } from "@/screens/WeeklyReportScreen";
import { MaterialProcurementScreen } from "@/screens/MaterialProcurementScreen";
import { SyncCenterScreen } from "@/screens/SyncCenterScreen";
import { RfiListScreen } from "@/screens/RfiListScreen";
import { RfiEditorScreen } from "@/screens/RfiEditorScreen";
import { TimesheetScreen } from "@/screens/TimesheetScreen";
import { SafetyBriefingsScreen } from "@/screens/SafetyBriefingsScreen";
import { SafetyBriefingEditorScreen } from "@/screens/SafetyBriefingEditorScreen";
import { WorkerCredentialsScreen } from "@/screens/WorkerCredentialsScreen";
import { WorkerCredentialEditorScreen } from "@/screens/WorkerCredentialEditorScreen";
import { SiteIncidentsScreen } from "@/screens/SiteIncidentsScreen";
import { SiteIncidentEditorScreen } from "@/screens/SiteIncidentEditorScreen";
import { MaterialDeliveriesScreen } from "@/screens/MaterialDeliveriesScreen";
import { MaterialDeliveryEditorScreen } from "@/screens/MaterialDeliveryEditorScreen";
import { MaterialStockScreen } from "@/screens/MaterialStockScreen";
import { MaterialStockMovementScreen } from "@/screens/MaterialStockMovementScreen";
import { TaskMaterialsScreen } from "@/screens/TaskMaterialsScreen";
import { TomorrowPlanScreen } from "@/screens/TomorrowPlanScreen";
import { AppErrorBoundary } from "@/components/AppErrorBoundary";
import type { SiteTaskKind } from "@/domain/types";

export type RootStackParamList = {
  Auth: undefined;
  Projects: undefined;
  Today: undefined;
  DiaryDraftReview: undefined;
  Diary:
    | {
        correctionOfId?: string;
        editId?: string;
        draft?: {
          logDate: string;
          workDescription: string;
          workerCount: number;
          note: string;
        };
      }
    | undefined;
  Delay: { correctionOfId?: string } | undefined;
  Checkin: undefined;
  PublicCheckin: { token?: string } | undefined;
  Reports: undefined;
  DiaryApprovals: undefined;
  ClientShare: undefined;
  Receipts: undefined;
  ReceiptEditor: { receiptId?: string } | undefined;
  ReceiptReports: undefined;
  Workforce: { tab?: "workers" | "requests" } | undefined;
  RequestReceiptLink: { requestId: string };
  MaterialProcurement: { requestId: string };
  Notifications: undefined;
  PilotAccount: undefined;
  Settings: undefined;
  Gallery: undefined;
  Support: undefined;
  Privacy: undefined;
  Plans: undefined;
  PlanBoard: { planId: string };
  Tasks: { kind?: SiteTaskKind } | undefined;
  TaskEditor:
    | {
        taskId?: string;
        defaultKind?: SiteTaskKind;
        planId?: string;
        pageNumber?: number;
        xRatio?: number;
        yRatio?: number;
      }
    | undefined;
  TaskEvidenceReport: { taskId: string };
  WeeklyReport: undefined;
  SyncCenter: undefined;
  RfiList: undefined;
  RfiEditor: {
    rfiId?: string;
    planId?: string;
    pageNumber?: number;
    xRatio?: number;
    yRatio?: number;
  };
  Timesheet: undefined;
  SafetyBriefings: undefined;
  SafetyBriefingEditor: { briefingId?: string } | undefined;
  WorkerCredentials: undefined;
  WorkerCredentialEditor: { workerId: string; credentialId?: string };
  SiteIncidents: undefined;
  SiteIncidentEditor: { incidentId?: string } | undefined;
  MaterialDeliveries: { requestId?: string } | undefined;
  MaterialDeliveryEditor:
    { requestId?: string; deliveryId?: string } | undefined;
  MaterialStock: undefined;
  MaterialStockMovement: { requestItemId?: string } | undefined;
  TaskMaterials: { taskId?: string } | undefined;
  TomorrowPlan: undefined;
};
const Stack = createNativeStackNavigator<RootStackParamList>();
const navigationRef = createNavigationContainerRef<RootStackParamList>();
const linking: LinkingOptions<RootStackParamList> = {
  prefixes: [Linking.createURL("/"), "stavebnydennik://"],
  config: {
    screens: {
      PublicCheckin: "checkin",
    },
  },
};

function Navigation() {
  const { userId, loading } = useAuth();
  const { state, loading: appLoading } = useApp();
  const handledNotificationId = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!userId || loading || appLoading) return;
    const openNotification = (response: Notifications.NotificationResponse) => {
      const identifier = response.notification.request.identifier;
      if (
        handledNotificationId.current === identifier ||
        !navigationRef.isReady()
      )
        return;
      const data = response.notification.request.content.data;
      if (data?.type === "project_rfi_due" && data.rfiId) {
        handledNotificationId.current = identifier;
        navigationRef.navigate("RfiEditor", { rfiId: String(data.rfiId) });
      } else if (data?.type === "day_closure_reminder") {
        handledNotificationId.current = identifier;
        navigationRef.navigate("DiaryDraftReview");
      }
    };
    const subscription =
      Notifications.addNotificationResponseReceivedListener(openNotification);
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) openNotification(response);
    });
    return () => subscription.remove();
  }, [appLoading, loading, userId]);
  if (loading)
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.surfaceAlt,
        }}
      >
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  if (userId && appLoading)
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.surfaceAlt,
        }}
      >
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  return (
    <NavigationContainer linking={linking} ref={navigationRef}>
      <Stack.Navigator
        initialRouteName={
          userId && state.selectedProjectId
            ? "Today"
            : userId
              ? "Projects"
              : "Auth"
        }
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.surfaceAlt },
        }}
      >
        {userId ? (
          <>
            <Stack.Screen name="Projects" component={ProjectsScreen} />
            <Stack.Screen name="Today" component={TodayScreen} />
            <Stack.Screen
              name="DiaryDraftReview"
              component={DiaryDraftReviewScreen}
            />
            <Stack.Screen name="Diary" component={DiaryScreen} />
            <Stack.Screen name="Delay" component={DelayScreen} />
            <Stack.Screen name="Checkin" component={CheckinScreen} />
            <Stack.Screen name="Reports" component={ReportsScreen} />
            <Stack.Screen
              name="DiaryApprovals"
              component={DiaryApprovalsScreen}
            />
            <Stack.Screen name="ClientShare" component={ClientShareScreen} />
            <Stack.Screen name="Receipts" component={ReceiptsScreen} />
            <Stack.Screen
              name="ReceiptEditor"
              component={ReceiptEditorScreen}
            />
            <Stack.Screen
              name="ReceiptReports"
              component={ReceiptReportsScreen}
            />
            <Stack.Screen name="Workforce" component={WorkforceScreen} />
            <Stack.Screen
              name="RequestReceiptLink"
              component={RequestReceiptLinkScreen}
            />
            <Stack.Screen
              name="MaterialProcurement"
              component={MaterialProcurementScreen}
            />
            <Stack.Screen
              name="Notifications"
              component={NotificationsScreen}
            />
            <Stack.Screen name="PilotAccount" component={PilotAccountScreen} />
            <Stack.Screen name="Settings" component={SettingsScreen} />
            <Stack.Screen name="Gallery" component={GalleryScreen} />
            <Stack.Screen name="Support" component={SupportScreen} />
            <Stack.Screen name="Privacy" component={PrivacyScreen} />
            <Stack.Screen name="Plans" component={PlansScreen} />
            <Stack.Screen name="PlanBoard" component={PlanBoardScreen} />
            <Stack.Screen name="Tasks" component={TasksScreen} />
            <Stack.Screen name="TaskEditor" component={TaskEditorScreen} />
            <Stack.Screen
              name="TaskEvidenceReport"
              component={TaskEvidenceReportScreen}
            />
            <Stack.Screen name="WeeklyReport" component={WeeklyReportScreen} />
            <Stack.Screen name="SyncCenter" component={SyncCenterScreen} />
            <Stack.Screen name="RfiList" component={RfiListScreen} />
            <Stack.Screen name="RfiEditor" component={RfiEditorScreen} />
            <Stack.Screen name="Timesheet" component={TimesheetScreen} />
            <Stack.Screen
              name="SafetyBriefings"
              component={SafetyBriefingsScreen}
            />
            <Stack.Screen
              name="SafetyBriefingEditor"
              component={SafetyBriefingEditorScreen}
            />
            <Stack.Screen
              name="WorkerCredentials"
              component={WorkerCredentialsScreen}
            />
            <Stack.Screen
              name="WorkerCredentialEditor"
              component={WorkerCredentialEditorScreen}
            />
            <Stack.Screen
              name="SiteIncidents"
              component={SiteIncidentsScreen}
            />
            <Stack.Screen
              name="SiteIncidentEditor"
              component={SiteIncidentEditorScreen}
            />
            <Stack.Screen
              name="MaterialDeliveries"
              component={MaterialDeliveriesScreen}
            />
            <Stack.Screen
              name="MaterialDeliveryEditor"
              component={MaterialDeliveryEditorScreen}
            />
            <Stack.Screen
              name="MaterialStock"
              component={MaterialStockScreen}
            />
            <Stack.Screen
              name="MaterialStockMovement"
              component={MaterialStockMovementScreen}
            />
            <Stack.Screen
              name="TaskMaterials"
              component={TaskMaterialsScreen}
            />
            <Stack.Screen name="TomorrowPlan" component={TomorrowPlanScreen} />
            <Stack.Screen
              name="PublicCheckin"
              component={PublicCheckinScreen}
            />
          </>
        ) : (
          <>
            <Stack.Screen name="Auth" component={AuthScreen} />
            <Stack.Screen
              name="PublicCheckin"
              component={PublicCheckinScreen}
            />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <AppErrorBoundary>
      <AuthProvider>
        <AppProvider>
          <StatusBar style="dark" />
          <Navigation />
        </AppProvider>
      </AuthProvider>
    </AppErrorBoundary>
  );
}
