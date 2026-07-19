import React from "react";
import { ActivityIndicator, View } from "react-native";
import {
  NavigationContainer,
  type LinkingOptions,
} from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import * as Linking from "expo-linking";
import { AuthProvider, useAuth } from "@/state/auth";
import { AppProvider } from "@/state/app";
import { useApp } from "@/state/app";
import { colors } from "@/theme/tokens";
import { AuthScreen } from "@/screens/AuthScreen";
import { ProjectsScreen } from "@/screens/ProjectsScreen";
import { TodayScreen } from "@/screens/TodayScreen";
import { DiaryScreen } from "@/screens/DiaryScreen";
import { DelayScreen } from "@/screens/DelayScreen";
import { CheckinScreen, PublicCheckinScreen } from "@/screens/CheckinScreen";
import { ReportsScreen } from "@/screens/ReportsScreen";
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
import { AppErrorBoundary } from "@/components/AppErrorBoundary";

export type RootStackParamList = {
  Auth: undefined;
  Projects: undefined;
  Today: undefined;
  Diary: { correctionOfId?: string; editId?: string } | undefined;
  Delay: { correctionOfId?: string } | undefined;
  Checkin: undefined;
  PublicCheckin: { token?: string } | undefined;
  Reports: undefined;
  Receipts: undefined;
  ReceiptEditor: { receiptId?: string } | undefined;
  ReceiptReports: undefined;
  Workforce: undefined;
  RequestReceiptLink: { requestId: string };
  Notifications: undefined;
  PilotAccount: undefined;
  Settings: undefined;
  Gallery: undefined;
  Support: undefined;
  Privacy: undefined;
};
const Stack = createNativeStackNavigator<RootStackParamList>();
const linking: LinkingOptions<RootStackParamList> = {
  prefixes: [Linking.createURL("/"), "stavebnydennik://"],
  config: { screens: { PublicCheckin: "checkin" } },
};

function Navigation() {
  const { userId, loading } = useAuth();
  const { state, loading: appLoading } = useApp();
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
    <NavigationContainer linking={linking}>
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
            <Stack.Screen name="Diary" component={DiaryScreen} />
            <Stack.Screen name="Delay" component={DelayScreen} />
            <Stack.Screen name="Checkin" component={CheckinScreen} />
            <Stack.Screen name="Reports" component={ReportsScreen} />
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
              name="Notifications"
              component={NotificationsScreen}
            />
            <Stack.Screen name="PilotAccount" component={PilotAccountScreen} />
            <Stack.Screen name="Settings" component={SettingsScreen} />
            <Stack.Screen name="Gallery" component={GalleryScreen} />
            <Stack.Screen name="Support" component={SupportScreen} />
            <Stack.Screen name="Privacy" component={PrivacyScreen} />
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
