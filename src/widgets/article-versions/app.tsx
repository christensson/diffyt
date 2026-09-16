import {memo} from 'react';

import {ARTICLE} from '@/common/compare/entity';
import {VersionsApp} from '@/common/compare/versions-app';

const host = await YTApp.register();

const AppComponent = () => (
  <VersionsApp host={host} adapter={ARTICLE} entityId={YTApp.entity?.id} locale={YTApp.locale}/>
);

export const App = memo(AppComponent);
