export type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
};

/**
 * Routes above the tab navigator.
 *
 * `HabitDetail` deliberately does not reuse the name `Stats`: that belongs to
 * the tab hosting StatsListScreen, so `navigate('Stats', {habitId})` used to
 * land on the list instead of the detail screen (issue #101).
 */
export type RootStackParamList = {
  Tabs: undefined;
  HabitDetail: {habitId: string};
  CreateHabit: undefined;
};

/**
 * The narrow slice of the navigation object the tab screens actually use.
 *
 * Typed against RootStackParamList so a route name that does not exist — the
 * #101 bug — fails to compile, while staying structurally simple enough for
 * `{navigate: jest.fn()}` test doubles.
 */
export type RootNavigation = {
  navigate<Route extends keyof RootStackParamList>(
    ...args: RootStackParamList[Route] extends undefined
      ? [screen: Route]
      : [screen: Route, params: RootStackParamList[Route]]
  ): void;
};
