import * as Discord from 'discord.js';
import {
    AnalyticsService as analyticsService,
    CommonService as cs,
    DiscordMessageService as discordMessageService,
    ParameterService as parameterService,
    PubgService as pubgApiService,
    SqlServerService as sqlServerService
} from '../../services';
import { Command, CommandConfiguration, CommandHelp, DiscordClientWrapper } from '../../entities';
import { PubgAPI, PlatformRegion, PlayerSeason, Player, GameModeStats } from 'pubg-typescript-api';
import { PubgParameters } from '../../interfaces';


interface ParameterMap {
    username: string;
    season: string;
    region: string;
    mode: string;
}

export class Role extends Command {

    conf: CommandConfiguration = {
        enabled: true,
        guildOnly: true,
        aliases: [],
        permLevel: 0,
    }

    help: CommandHelp = {
        name: 'role',
        description: '',
        usage: '',
        examples: []
    }

    private paramMap: ParameterMap;

    async run(bot: DiscordClientWrapper, msg: Discord.Message, params: string[], perms: number) {
        const botHasPermissions: boolean = msg.guild.members.find('id', bot.user.id).hasPermission('MANAGE_ROLES');
        if (!botHasPermissions) {
            await msg.channel.send(':warning: Bot is missing the `General Permissions > Manage Roles` permission. Give permission so the bot can assign roles. :warning:');
            return;
        }

        try {
            this.paramMap = await this.getParameters(msg, params);
        } catch(e) {
            return;
        }

        const reply: Discord.Message = (await msg.channel.send('Checking for valid parameters ...')) as Discord.Message;
        const isValidParameters = await pubgApiService.validateParameters(msg, this.help, this.paramMap.season, this.paramMap.region, this.paramMap.mode);
        if(!isValidParameters) {
            reply.delete();
            return;
        }

        const seasonData: PlayerSeason = await this.getPlayerSeasonData(reply)
        await this.ensureRolesExist(msg.guild);
        await this.updateRoles(reply, seasonData, msg.author);
    }

    /**
     * Retrieves the paramters for the command
     * @param {Discord.Message} msg
     * @param {string[]} params
     * @returns {Promise<ParameterMap>}
     */
    private async getParameters(msg: Discord.Message, params: string[]): Promise<ParameterMap> {
        let paramMap: ParameterMap;

        let pubg_params: PubgParameters;
        const serverDefaults = await sqlServerService.getServerDefaults(msg.guild.id);
        pubg_params = await parameterService.getPubgParameters(params.join(' '), msg.author.id, true, serverDefaults);


        // Throw error if no username supplied
        if (!pubg_params.username) {
            discordMessageService.handleError(msg, 'Error:: Must specify a username or register with `register` command', this.help);
            throw 'Error:: Must specify a username';
        }

        paramMap = {
            username: pubg_params.username,
            season: pubg_params.season,
            region: pubg_params.region.toUpperCase().replace('-', '_'),
            mode: pubg_params.mode.toUpperCase().replace('-', '_')
        }

        analyticsService.track(this.help.name, {
            distinct_id: msg.author.id,
            discord_id: msg.author.id,
            discord_username: msg.author.tag,
            number_parameters: params.length,
            pubg_name: paramMap.username,
            season: paramMap.season,
            region: paramMap.region,
            mode: paramMap.mode
        });

        return paramMap;
    }

    private async getPlayerSeasonData(msg: Discord.Message): Promise<PlayerSeason> {
        const message: Discord.Message = await msg.edit(`Getting data for **${this.paramMap.username}**`);
        const pubgPlayersApi: PubgAPI = new PubgAPI(cs.getEnvironmentVariable('pubg_api_key'), PlatformRegion[this.paramMap.region]);
        const players: Player[] = await pubgApiService.getPlayerByName(pubgPlayersApi, [this.paramMap.username]);

        if (players.length === 0) {
            message.edit(`Could not find **${this.paramMap.username}** on the \`${this.paramMap.region}\` region for the \`${this.paramMap.season}\` season. Double check the username, region, and ensure you've played this season.`);
            return;
        }
        const player: Player = players[0];
        if (!player.id) {
            message.edit(`Could not find **${this.paramMap.username}** on the \`${this.paramMap.region}\` region for the \`${this.paramMap.season}\` season. Double check the username, region, and ensure you've played this season.`);
            return;
        }

        // Get Player Data
        try {
            const seasonStatsApi: PubgAPI = pubgApiService.getSeasonStatsApi(PlatformRegion[this.paramMap.region], this.paramMap.season);
            return await pubgApiService.getPlayerSeasonStatsById(seasonStatsApi, player.id, this.paramMap.season);
        } catch(e) {
            message.edit(`Could not find **${this.paramMap.username}** on the \`${this.paramMap.region}\` region for the \`${this.paramMap.season}\` season. Double check the username, region, and ensure you've played this season.`);
            return;
        }
    }

    private async ensureRolesExist(guild: Discord.Guild) {
        const color: string = 'F2A900';
        const roles: Discord.RoleData[] = [
            {
                name: 'PUBG-Bronze',
                color: color,
                mentionable: true
            },
            {
                name: 'PUBG-Silver',
                color: color,
                mentionable: true
            },
            {
                name: 'PUBG-Gold',
                color: color,
                mentionable: true
            },
            {
                name: 'PUBG-Platinum',
                color: color,
                mentionable: true
            },
            {
                name: 'PUBG-Diamond',
                color: color,
                mentionable: true
            },
            {
                name: 'PUBG-Elite',
                color: color,
                mentionable: true
            },
            {
                name: 'PUBG-Master',
                color: color,
                mentionable: true
            },
            {
                name: 'PUBG-GrandMaster',
                color: color,
                mentionable: true
            },
        ];

        const existingRoles: Discord.Collection<string, Discord.Role> = guild.roles;
        roles.forEach(async (role) => {
            const roleAlreadyExists: boolean = existingRoles.exists('name', role.name);
            if (!roleAlreadyExists) {
                await guild.createRole(role).catch(console.error);
            };
        });

    }

    private async updateRoles(msg: Discord.Message, seasonData: PlayerSeason, author: Discord.User) {
        await msg.edit('Updating roles ...');

        const pubgRoleNames: string[] = ['PUBG-Bronze', 'PUBG-Silver', 'PUBG-Gold', 'PUBG-Platinum', 'PUBG-Diamond', 'PUBG-Elite', 'PUBG-Master', 'PUBG-GrandMaster'];
        const member: Discord.GuildMember = msg.guild.member(author.id);
        const roles: Discord.Collection<string, Discord.Role> = member.roles;
        const nonPubgRoles: Discord.Collection<string, Discord.Role> = roles.filter(role => !pubgRoleNames.includes(role.name));

        // get role to add
        const seasonStats: GameModeStats[] = [seasonData.soloStats, seasonData.soloFPPStats, seasonData.duoStats, seasonData.duoFPPStats, seasonData.squadStats, seasonData.squadFPPStats];
        let rankPointsArray: number[] = [];

        for (let stats of seasonStats) {
            rankPointsArray.push(stats.rankPoints);
        }

        rankPointsArray.sort((a: number, b: number) => { return b-a; });
        if (rankPointsArray.length === 0) { return; }

        const rankTitle = pubgApiService.getRankTitleFromRanking(rankPointsArray[0]);
        await msg.edit(`Assigning **PUBG-${rankTitle}** to **${author.username}**`)

        // Add roles
        let role: Discord.Role = msg.guild.roles.find("name", `PUBG-${rankTitle}`);
        let newRoles: Discord.Role[] = [];
        for(let role of nonPubgRoles) {
            newRoles.push(role[1]);
        }
        newRoles.push(role);

        await member.setRoles(newRoles).catch(console.error);

    }


}
