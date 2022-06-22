import { None, Option, Some } from "@sniptt/monads";
import autosize from "autosize";
import { Component, linkEvent } from "inferno";
import {
  BannedPersonsResponse,
  GetBannedPersons,
  GetSiteConfig,
  GetSiteConfigResponse,
  GetSiteResponse,
  PersonViewSafe,
  SaveSiteConfig,
  SiteResponse,
  toUndefined,
  UserOperation,
  wsJsonToRes,
  wsUserOp,
} from "lemmy-js-client";
import { Subscription } from "rxjs";
import { i18n } from "../../i18next";
import { InitialFetchRequest } from "../../interfaces";
import { WebSocketService } from "../../services";
import {
  auth,
  capitalizeFirstLetter,
  isBrowser,
  randomStr,
  setIsoData,
  showLocal,
  toast,
  wsClient,
  wsSubscribe,
} from "../../utils";
import { HtmlTags } from "../common/html-tags";
import { Spinner } from "../common/icon";
import { PersonListing } from "../person/person-listing";
import { SiteForm } from "./site-form";

interface AdminSettingsState {
  siteRes: GetSiteResponse;
  siteConfigRes: Option<GetSiteConfigResponse>;
  siteConfigHjson: Option<string>;
  banned: PersonViewSafe[];
  loading: boolean;
  siteConfigLoading: boolean;
  leaveAdminTeamLoading: boolean;
}

export class AdminSettings extends Component<any, AdminSettingsState> {
  private siteConfigTextAreaId = `site-config-${randomStr()}`;
  private isoData = setIsoData(
    this.context,
    GetSiteConfigResponse,
    BannedPersonsResponse
  );
  private subscription: Subscription;
  private emptyState: AdminSettingsState = {
    siteRes: this.isoData.site_res,
    siteConfigHjson: None,
    siteConfigRes: None,
    banned: [],
    loading: true,
    siteConfigLoading: null,
    leaveAdminTeamLoading: null,
  };

  constructor(props: any, context: any) {
    super(props, context);

    this.state = this.emptyState;

    this.parseMessage = this.parseMessage.bind(this);
    this.subscription = wsSubscribe(this.parseMessage);

    // Only fetch the data if coming from another route
    if (this.isoData.path == this.context.router.route.match.url) {
      this.state.siteConfigRes = Some(
        this.isoData.routeData[0] as GetSiteConfigResponse
      );
      this.state.siteConfigHjson = this.state.siteConfigRes.map(
        s => s.config_hjson
      );
      this.state.banned = (
        this.isoData.routeData[1] as BannedPersonsResponse
      ).banned;
      this.state.siteConfigLoading = false;
      this.state.loading = false;
    } else {
      WebSocketService.Instance.send(
        wsClient.getSiteConfig({
          auth: auth().unwrap(),
        })
      );
      WebSocketService.Instance.send(
        wsClient.getBannedPersons({
          auth: auth().unwrap(),
        })
      );
    }
  }

  static fetchInitialData(req: InitialFetchRequest): Promise<any>[] {
    let promises: Promise<any>[] = [];

    let siteConfigForm = new GetSiteConfig({ auth: req.auth.unwrap() });
    promises.push(req.client.getSiteConfig(siteConfigForm));

    let bannedPersonsForm = new GetBannedPersons({ auth: req.auth.unwrap() });
    promises.push(req.client.getBannedPersons(bannedPersonsForm));

    return promises;
  }

  componentDidMount() {
    if (isBrowser()) {
      var textarea: any = document.getElementById(this.siteConfigTextAreaId);
      autosize(textarea);
    }
  }

  componentWillUnmount() {
    if (isBrowser()) {
      this.subscription.unsubscribe();
    }
  }

  get documentTitle(): string {
    return this.state.siteRes.site_view.match({
      some: siteView => `${i18n.t("admin_settings")} - ${siteView.site.name}`,
      none: "",
    });
  }

  render() {
    return (
      <div class="container">
        {this.state.loading ? (
          <h5>
            <Spinner large />
          </h5>
        ) : (
          <div class="row">
            <div class="col-12 col-md-6">
              <HtmlTags
                title={this.documentTitle}
                path={this.context.router.route.match.url}
                description={None}
                image={None}
              />
              {this.state.siteRes.site_view.match({
                some: siteView => (
                  <SiteForm
                    site={Some(siteView.site)}
                    showLocal={showLocal(this.isoData)}
                  />
                ),
                none: <></>,
              })}
              {this.admins()}
              {this.bannedUsers()}
            </div>
            <div class="col-12 col-md-6">{this.adminSettings()}</div>
          </div>
        )}
      </div>
    );
  }

  admins() {
    return (
      <>
        <h5>{capitalizeFirstLetter(i18n.t("admins"))}</h5>
        <ul class="list-unstyled">
          {this.state.siteRes.admins.map(admin => (
            <li class="list-inline-item">
              <PersonListing person={admin.person} />
            </li>
          ))}
        </ul>
        {this.leaveAdmin()}
      </>
    );
  }

  leaveAdmin() {
    return (
      <button
        onClick={linkEvent(this, this.handleLeaveAdminTeam)}
        class="btn btn-danger mb-2"
      >
        {this.state.leaveAdminTeamLoading ? (
          <Spinner />
        ) : (
          i18n.t("leave_admin_team")
        )}
      </button>
    );
  }

  bannedUsers() {
    return (
      <>
        <h5>{i18n.t("banned_users")}</h5>
        <ul class="list-unstyled">
          {this.state.banned.map(banned => (
            <li class="list-inline-item">
              <PersonListing person={banned.person} />
            </li>
          ))}
        </ul>
      </>
    );
  }

  adminSettings() {
    return (
      <div>
        <h5>{i18n.t("admin_settings")}</h5>
        <form onSubmit={linkEvent(this, this.handleSiteConfigSubmit)}>
          <div class="form-group row">
            <label
              class="col-12 col-form-label"
              htmlFor={this.siteConfigTextAreaId}
            >
              {i18n.t("site_config")}
            </label>
            <div class="col-12">
              <textarea
                id={this.siteConfigTextAreaId}
                value={toUndefined(this.state.siteConfigHjson)}
                onInput={linkEvent(this, this.handleSiteConfigHjsonChange)}
                class="form-control text-monospace"
                rows={3}
              />
            </div>
          </div>
          <div class="form-group row">
            <div class="col-12">
              <button type="submit" class="btn btn-secondary mr-2">
                {this.state.siteConfigLoading ? (
                  <Spinner />
                ) : (
                  capitalizeFirstLetter(i18n.t("save"))
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    );
  }

  handleSiteConfigSubmit(i: AdminSettings, event: any) {
    event.preventDefault();
    i.state.siteConfigLoading = true;
    let form = new SaveSiteConfig({
      config_hjson: toUndefined(i.state.siteConfigHjson),
      auth: auth().unwrap(),
    });
    WebSocketService.Instance.send(wsClient.saveSiteConfig(form));
    i.setState(i.state);
  }

  handleSiteConfigHjsonChange(i: AdminSettings, event: any) {
    i.state.siteConfigHjson = event.target.value;
    i.setState(i.state);
  }

  handleLeaveAdminTeam(i: AdminSettings) {
    i.state.leaveAdminTeamLoading = true;
    WebSocketService.Instance.send(
      wsClient.leaveAdmin({ auth: auth().unwrap() })
    );
    i.setState(i.state);
  }

  parseMessage(msg: any) {
    let op = wsUserOp(msg);
    console.log(msg);
    if (msg.error) {
      toast(i18n.t(msg.error), "danger");
      this.context.router.history.push("/");
      this.state.loading = false;
      this.setState(this.state);
      return;
    } else if (op == UserOperation.EditSite) {
      let data = wsJsonToRes<SiteResponse>(msg, SiteResponse);
      this.state.siteRes.site_view = Some(data.site_view);
      this.setState(this.state);
      toast(i18n.t("site_saved"));
    } else if (op == UserOperation.GetBannedPersons) {
      let data = wsJsonToRes<BannedPersonsResponse>(msg, BannedPersonsResponse);
      this.state.banned = data.banned;
      this.setState(this.state);
    } else if (op == UserOperation.GetSiteConfig) {
      let data = wsJsonToRes<GetSiteConfigResponse>(msg, GetSiteConfigResponse);
      this.state.siteConfigRes = Some(data);
      this.state.loading = false;
      this.state.siteConfigHjson = this.state.siteConfigRes.map(
        s => s.config_hjson
      );
      this.setState(this.state);
      var textarea: any = document.getElementById(this.siteConfigTextAreaId);
      autosize(textarea);
    } else if (op == UserOperation.LeaveAdmin) {
      let data = wsJsonToRes<GetSiteResponse>(msg, GetSiteResponse);
      this.state.siteRes.site_view = data.site_view;
      this.setState(this.state);
      this.state.leaveAdminTeamLoading = false;
      toast(i18n.t("left_admin_team"));
      this.setState(this.state);
      this.context.router.history.push("/");
    } else if (op == UserOperation.SaveSiteConfig) {
      let data = wsJsonToRes<GetSiteConfigResponse>(msg, GetSiteConfigResponse);
      this.state.siteConfigRes = Some(data);
      this.state.siteConfigHjson = this.state.siteConfigRes.map(
        s => s.config_hjson
      );
      this.state.siteConfigLoading = false;
      toast(i18n.t("site_saved"));
      this.setState(this.state);
    }
  }
}
